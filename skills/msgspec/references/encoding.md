# Encoding & Decoding

Codecs for JSON, MessagePack, YAML, and TOML. Encoder / Decoder class signatures, custom-type hooks, streaming patterns, and format-specific quirks.

## Choosing a format

| Format | Pros | Cons |
|---|---|---|
| `msgspec.json` | Universal, human-readable, no extra deps. | Larger than binary; slower than msgpack. |
| `msgspec.msgpack` | Compact, fastest. Binary types are first-class. | Not human-readable. |
| `msgspec.yaml` | Human-friendly config format. Multi-doc support. | Requires `pyyaml`. Slowest. |
| `msgspec.toml` | Stricter, readable config format. | Cannot encode `None` at top level / in arrays. Requires `tomli_w` to encode. |

Speed order (decode, typical Structs): `msgpack > json >> toml > yaml`.

## JSON

### Function-form API

```python
import msgspec

buf = msgspec.json.encode(obj, *, enc_hook=None, order=None) -> bytes
obj = msgspec.json.decode(buf, *, type=Any, strict=True, dec_hook=None) -> Any
formatted = msgspec.json.format(buf, *, indent=2) -> bytes  # pretty-print
```

Convenient for cold paths. Each call constructs a fresh encoder/decoder.

```python
buf = msgspec.json.encode({"x": 1, "y": 2})
obj = msgspec.json.decode(buf, type=dict[str, int])
print(msgspec.json.format(buf).decode())   # pretty-printed
```

### Encoder

```python
class msgspec.json.Encoder:
    def __init__(
        self, *,
        enc_hook: Callable[[Any], Any] | None = None,
        decimal_format: Literal["string", "number"] = "string",
        uuid_format: Literal["canonical", "hex"] = "canonical",
        order: Literal[None, "deterministic", "sorted"] = None,
    ): ...

    def encode(self, obj: Any) -> bytes: ...
    def encode_lines(self, items: Iterable) -> bytes: ...     # NDJSON
    def encode_into(self, obj: Any, buffer: bytearray, offset: int = 0) -> None: ...
```

**`order` options**:

- `None` (default) — insertion order (Struct field order, dict insertion).
- `"deterministic"` — stable across runs but not necessarily sorted (faster than full sort).
- `"sorted"` — keys in lexicographic order. Useful for canonical hashing, snapshot tests.

### Decoder

```python
class msgspec.json.Decoder[T]:
    def __init__(
        self,
        type: Type[T] = Any, *,
        strict: bool = True,
        dec_hook: Callable[[type, Any], Any] | None = None,
        float_hook: Callable[[str], Any] | None = None,
    ): ...

    def decode(self, buf: bytes | str) -> T: ...
    def decode_lines(self, buf: bytes | str) -> list[T]: ...   # NDJSON
```

**`strict=False`** allows common coercions (string `"42"` → int 42). Use sparingly, at trust boundaries.

**`float_hook`** is called for every parsed number as a string. Use to preserve precision (e.g. `Decimal(s)`) or detect integer-shaped numbers.

### Reuse pattern (hot loops)

```python
enc = msgspec.json.Encoder()
dec = msgspec.json.Decoder(Config)

for raw in stream:
    cfg = dec.decode(raw)
    process(cfg)
    out.write(enc.encode(cfg))
```

`Encoder` and `Decoder` are thread-safe for their own methods. Constructing them is the expensive step.

### NDJSON (line-delimited JSON)

```python
events = [Event(...), Event(...), Event(...)]
buf = enc.encode_lines(events)
# b'{"...":...}\n{"...":...}\n{"...":...}\n'

decoded = dec.decode_lines(buf)   # list[Event]
```

`encode_lines` always appends a final `\n`. `decode_lines` returns a list — for true streaming, split lines yourself and call `decode` per line.

### Buffer reuse with `encode_into`

```python
buffer = bytearray()
for obj in objects:
    enc.encode_into(obj, buffer)
    socket.sendall(buffer)
    buffer.clear()
```

Avoids per-call allocation. The buffer grows automatically. Use `offset` to append into an existing buffer instead of overwriting.

## MessagePack

```python
buf = msgspec.msgpack.encode(obj, *, enc_hook=None, order=None) -> bytes
obj = msgspec.msgpack.decode(
    buf, *, type=Any, strict=True, dec_hook=None, ext_hook=None
) -> Any
```

```python
class msgspec.msgpack.Encoder:
    def __init__(
        self, *,
        enc_hook=None,
        decimal_format: Literal["string","number"] = "string",
        uuid_format: Literal["canonical","hex","bytes"] = "canonical",
        order=None,
    ): ...

    def encode(self, obj) -> bytes: ...
    def encode_into(self, obj, buffer: bytearray, offset: int = 0) -> None: ...

class msgspec.msgpack.Decoder[T]:
    def __init__(self, type=Any, *, strict=True, dec_hook=None, ext_hook=None): ...
    def decode(self, buf: bytes) -> T: ...
```

### MessagePack-specific behavior

- `bytes` / `bytearray` use the msgpack `bin` type — no base64.
- `uuid_format="bytes"` packs UUIDs as 16-byte binary (smallest representation).
- Datetimes use the msgpack timestamp extension type when round-tripping with another msgpack implementation.
- No NDJSON equivalent — msgpack is self-delimiting, so concatenated messages stream naturally.

### Custom binary types: `Ext`

For binary types not natively supported, use the `Ext` mechanism:

```python
from msgspec.msgpack import Ext

class TensorBlob:
    def __init__(self, data: bytes):
        self.data = data

def enc_hook(obj):
    if isinstance(obj, TensorBlob):
        return Ext(code=1, data=obj.data)
    raise NotImplementedError(type(obj))

def ext_hook(code: int, data: memoryview) -> Any:
    if code == 1:
        return TensorBlob(bytes(data))     # copy out; do NOT keep the memoryview
    raise NotImplementedError(code)

enc = msgspec.msgpack.Encoder(enc_hook=enc_hook)
dec = msgspec.msgpack.Decoder(SomeStruct, ext_hook=ext_hook)
```

The `memoryview` passed to `ext_hook` references the input buffer and is only valid for the duration of the call — copy if you need to keep it.

## YAML

Requires `pyyaml`. Top-level functions only:

```python
buf = msgspec.yaml.encode(obj, *, enc_hook=None, order=None) -> bytes
obj = msgspec.yaml.decode(buf, *, type=Any, strict=True, dec_hook=None) -> Any
```

```python
class Config(Struct):
    name: str
    epochs: int = 10

cfg = msgspec.yaml.decode(
    b"name: my-run\nepochs: 25\n",
    type=Config,
)
```

YAML decoding uses PyYAML's safe loader internally and routes through `msgspec.convert` for validation. There is no `Encoder` / `Decoder` class — overhead is dominated by PyYAML, not msgspec.

For YAML with anchors / aliases / multi-doc files, fall back to `pyyaml` directly and pass the loaded dict through `msgspec.convert`.

## TOML

Requires `tomli_w` for encoding. Decoding uses `tomllib` on Python 3.11+ or `tomli` otherwise.

```python
buf = msgspec.toml.encode(obj, *, enc_hook=None, order=None) -> bytes
obj = msgspec.toml.decode(buf, *, type=Any, strict=True, dec_hook=None) -> Any
```

```python
class Pyproject(Struct):
    project: dict
    tool: dict | None = None

cfg = msgspec.toml.decode(open("pyproject.toml", "rb").read(), type=Pyproject)
```

### TOML quirks

- **`None` is not representable.** Top-level or array-nested `None` raises on encode. Either omit the field (`omit_defaults=True`) or use a sentinel.
- **All top-level values must be table-like** in TOML — primitives at the top level cannot be encoded.
- **Datetime values are native TOML datetimes** — they round-trip without ISO 8601 strings.

## Custom-type hooks (`enc_hook` / `dec_hook`)

Codec-agnostic mechanism for types msgspec doesn't natively support (`pathlib.Path`, `numpy.ndarray`, third-party objects).

### Encode hook

```python
def enc_hook(obj: Any) -> Any:
    # Return a value msgspec already knows how to encode
    # (dict, list, str, int, bytes, etc.).
    if isinstance(obj, pathlib.Path):
        return str(obj)
    if isinstance(obj, complex):
        return [obj.real, obj.imag]
    raise NotImplementedError(type(obj))
```

Always `raise NotImplementedError` for unsupported types — msgspec converts this into a clean `EncodeError`. Returning `None` would silently encode `null`.

### Decode hook

```python
def dec_hook(tp: type, obj: Any) -> Any:
    # tp is the annotated target type; obj is the decoded built-in value.
    if tp is pathlib.Path:
        return pathlib.Path(obj)
    if tp is complex:
        return complex(*obj)
    raise NotImplementedError(tp)
```

Raising `TypeError` / `ValueError` in the hook surfaces as `ValidationError` with the field path. Other exception types propagate as-is.

### Wiring it up

Pass hooks to either the function-form call or to the Encoder/Decoder constructor:

```python
# Function form
buf = msgspec.json.encode(obj, enc_hook=enc_hook)
obj = msgspec.json.decode(buf, type=Config, dec_hook=dec_hook)

# Class form (reuse-friendly)
enc = msgspec.json.Encoder(enc_hook=enc_hook)
dec = msgspec.json.Decoder(Config, dec_hook=dec_hook)
```

A single pair of hooks can dispatch across many custom types — it's a chain of `if isinstance(...) / if tp is ...` checks. Don't define one hook per type unless you really must.

## Format-portable hooks

A hook written once works across all four codecs. You can share an `enc_hook` between JSON and msgpack encoders by passing the same function to both constructors.

For per-format quirks (e.g. msgpack's `Ext`, JSON's base64 vs msgpack's bin for bytes), keep the hook codec-aware:

```python
def enc_hook_msgpack(obj):
    if isinstance(obj, np.ndarray):
        return Ext(code=2, data=obj.tobytes())   # msgpack-only
    raise NotImplementedError(type(obj))

def enc_hook_json(obj):
    if isinstance(obj, np.ndarray):
        return obj.tolist()                       # portable
    raise NotImplementedError(type(obj))
```

## Strict vs lax decoding

| `strict` | Effect |
|---|---|
| `True` (default) | No silent coercion. JSON string `"42"` does not become Python `int(42)`. |
| `False` | Coerce common cases: numeric strings → numbers, `"true"`/`"false"` → bool, list of two → tuple, etc. |

```python
msgspec.json.decode(b'{"x":"42"}', type=Point)                # ValidationError
msgspec.json.decode(b'{"x":"42"}', type=Point, strict=False)  # Point(x=42, ...)
```

Use `strict=False` only when you know the producer's quirks (e.g. browsers stringifying numbers). Otherwise leave it on — bugs surface at the boundary instead of propagating.

## Error handling

```python
import msgspec

try:
    cfg = msgspec.json.decode(buf, type=Config)
except msgspec.ValidationError as exc:
    # Type mismatch, missing required field, constraint violation
    log.error("bad config: %s", exc)
except msgspec.DecodeError as exc:
    # Malformed JSON / msgpack / yaml / toml
    log.error("malformed input: %s", exc)
```

Hierarchy: `MsgspecError` → `DecodeError` → `ValidationError`. Catching `MsgspecError` covers both encoding and decoding failures.

`ValidationError` messages include a JSON-Pointer-style location (`$.outer.inner[2].field`) for deeply-nested errors.

## Streaming patterns

**JSON over sockets / files**: use NDJSON.

```python
enc = msgspec.json.Encoder()
dec = msgspec.json.Decoder(Event)

# Producer
for evt in events:
    sock.send(enc.encode(evt) + b"\n")

# Consumer
buf = b""
while chunk := sock.recv(4096):
    buf += chunk
    while b"\n" in buf:
        line, buf = buf.split(b"\n", 1)
        if line:
            yield dec.decode(line)
```

**MessagePack over sockets**: msgpack messages are self-delimiting; concatenate freely.

```python
# msgpack has no separator — use a length-prefix or the streaming `Unpacker` from msgpack-python
# for unbounded streams, or read complete records of known size with msgspec.
```

For more sophisticated streaming (length-prefixed binary frames, multi-doc YAML), msgspec is happy to be the per-message codec while a separate library handles framing.

## Encoding edge cases

- **Sets** are encoded as arrays in JSON / msgpack — order is unspecified. Use `frozenset` if hashability matters.
- **Tuples** with `tuple[A, B]` (fixed) and `tuple[T, ...]` (variable) are both encoded as arrays.
- **`Decimal`**: `decimal_format="string"` (default) preserves precision. `"number"` may lose precision for very large values but is more interoperable.
- **`UUID`**: `uuid_format="canonical"` produces the standard `"xxxxxxxx-xxxx-..."` form. `"hex"` strips dashes. `"bytes"` (msgpack only) packs as 16 raw bytes.
- **`datetime`**: timezone-naive datetimes lose tz info on encode; use timezone-aware datetimes for round-trip fidelity.
