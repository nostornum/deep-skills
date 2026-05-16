# Best Practices

Performance tips, hot-path patterns, common gotchas, and guidance on when to reach for msgspec vs other libraries.

## Performance

msgspec is already among the fastest serializers in Python. The tips below squeeze out the last 10–80%, depending on workload.

### 1. Reuse `Encoder` / `Decoder` instances

The function-form (`msgspec.json.encode(obj)`) constructs internal state on every call. In a hot loop, instantiate once:

```python
enc = msgspec.json.Encoder()
dec = msgspec.json.Decoder(Event)

for raw in stream:                       # ← hot loop
    evt = dec.decode(raw)
    out.write(enc.encode(evt) + b"\n")
```

Decoder construction is especially expensive for tagged unions or generic Structs (msgspec compiles a dispatch table) — never reconstruct per call.

### 2. `array_like=True` for narrow schemas

Encoding a Struct as a JSON array (`[1, 2.0, "x"]`) instead of an object (`{"a":1,"b":2.0,"c":"x"}`) skips field names, shrinks the payload, and speeds decoding by ~2x.

```python
class Frame(Struct, array_like=True, frozen=True):
    timestamp: float
    sensor_id: int
    value: float
```

Trade-offs:

- **Wire-format ordering is permanent.** Reordering fields silently breaks compatibility.
- **Less debuggable.** No field names in the encoded bytes.
- **Best for high-frequency machine-to-machine messages**, not human-readable configs.

### 3. `gc=False` when cycles are impossible

By default, msgspec Structs participate in Python's cyclic GC. Setting `gc=False` removes them from GC tracking, reducing memory pressure and pause times.

```python
class Event(Struct, gc=False):
    timestamp: float
    payload: bytes
```

Safe only if instances cannot form reference cycles. Cycles require at least one mutable reference path — `frozen=True` Structs holding only scalars never cycle.

### 4. `omit_defaults=True` for sparse payloads

Skipping fields at their defaults shrinks payload size and slightly speeds encoding. Particularly useful for patch / partial-update messages.

```python
class UserUpdate(Struct, kw_only=True, omit_defaults=True):
    name: str | None = None
    email: str | None = None
    age: int | None = None
```

Combine with `UNSET` (see `advanced.md`) to distinguish "not provided" from "explicitly null".

### 5. `cache_hash=True` for frozen hashable Structs

When a frozen Struct is used as a dict key or set element repeatedly, cache the hash:

```python
class Vec(Struct, frozen=True, cache_hash=True):
    x: float
    y: float

cache = {Vec(0.0, 0.0): "origin"}        # hash computed once, cached
```

Only useful with `frozen=True`. msgspec rejects the combination otherwise.

### 6. Narrow "view" Structs

When decoding large messages but reading only a handful of fields, define a Struct with only those fields. msgspec efficiently skips unknown keys.

```python
class GitHubEventView(Struct):
    id: int
    type: str
    created_at: datetime
    # ... ignore the 50+ other fields in the GitHub event payload

events = [dec.decode(line) for line in lines]
```

Same idea works for tagged unions — define a "tag-only" Struct to dispatch before decoding the full body.

### 7. `encode_into(obj, buffer)` for socket loops

Reuses a `bytearray` instead of allocating new bytes objects per encode:

```python
buffer = bytearray()
for evt in events:
    enc.encode_into(evt, buffer)
    sock.sendall(buffer)
    buffer.clear()
```

Helps in send-heavy paths (telemetry, log shippers). Not worth it for single-shot calls.

### 8. Skip the wrapper when possible

`msgspec.json.encode(d)` where `d` is a plain dict (no Structs inside) is still fast, but if you control the data and can avoid round-tripping through a Struct entirely, you save the Struct allocation. Don't construct a Struct just to encode it once.

### 9. Hot-path summary

```python
# Compose all the perf options for a high-throughput record type
class Event(
    Struct,
    array_like=True,        # compact wire format
    gc=False,               # no cyclic-GC overhead
    frozen=True,            # immutable
    cache_hash=True,        # dict-key reuse
):
    timestamp: float
    sensor_id: int
    value: float
```

This is a "max-perf" config — apply each option deliberately, not by default.

## Common pitfalls

### Construction does not validate types

```python
class Point(Struct):
    x: int
    y: int

Point(x="not-an-int", y=2)               # OK at runtime
```

If you build Structs from untrusted Python code (dicts from another library), use `msgspec.convert(obj, type=Point)` instead.

### `tag_field` defaults to `"type"`

If your schema already uses `"type"` as a real field, the default discriminator field will collide. Set `tag_field="kind"` (or similar) on all variants.

### Mutable defaults trip you up

```python
class C(Struct):
    items: list = [1, 2]                 # TypeError on class creation
```

Use `field(default_factory=lambda: [1, 2])`. The empty literals `[]` / `{}` / `set()` are safe (sugar for factories).

### `frozen=True` doesn't apply during `__init__`

Frozen prevents post-init mutation. Inside `__init__` (and `__post_init__`), fields can still be assigned. `structs.force_setattr` is the explicit escape hatch.

### `asdict` is shallow

Nested Structs stay as Structs:

```python
class Inner(Struct): x: int
class Outer(Struct): inner: Inner

d = msgspec.structs.asdict(Outer(inner=Inner(x=1)))
# {"inner": Inner(x=1)}                  # ← not a nested dict
```

Use `msgspec.to_builtins` for fully-plain dicts.

### `UNSET` is falsy

```python
if patch.field:                          # treats UNSET and None the same
    ...
if patch.field is UNSET:                 # explicit check
    ...
```

Always use `is UNSET` for unambiguous checks.

### `__post_init__` runs on decode too

If `__post_init__` has side effects (logging, registering with a global), they fire every time a message is decoded — usually not what you want. Keep `__post_init__` pure or guard side effects.

### Type alias trap with `Annotated`

```python
PositiveInt = Annotated[int, Meta(gt=0)]
NonZeroOrPositive = Annotated[PositiveInt, Meta(le=100)]
# OK — constraints merge: gt=0, le=100
```

Stacking `Annotated` aliases works, but readers may miss merged constraints. Either flatten the alias or comment the combined behavior.

### Strict mode quirks

`strict=True` does not coerce numeric strings to numbers. JSON producers that stringify large integers (to dodge JS's 53-bit limit) need `strict=False` to decode cleanly. Limit `strict=False` to the input boundary; do not propagate it through every internal `decode` call.

## Anti-patterns

### Re-validating on attribute access

msgspec is not pydantic. Don't write properties that re-validate:

```python
class Bad(Struct):
    _x: int                              # ← misuse of msgspec

    @property
    def x(self) -> int:
        if self._x < 0:
            raise ValueError(...)
        return self._x
```

If you need always-on validation, pick pydantic or wrap a frozen Struct with a façade that validates at the boundary.

### Decoding into `Any` then casting

```python
data = msgspec.json.decode(buf)          # type=Any
assert isinstance(data, dict)
config = Config(**data)                  # bypasses validation
```

Decode directly into the target type: `msgspec.json.decode(buf, type=Config)`.

### Decoder construction in a hot loop

```python
for line in stream:
    dec = msgspec.json.Decoder(Event)    # ← rebuilds every iteration
    yield dec.decode(line)
```

Hoist the Decoder out of the loop.

### Per-call function-form for high-volume work

```python
for evt in events:
    out.write(msgspec.json.encode(evt))  # ← allocates encoder state each call
```

Hoist to a reused `Encoder` instance.

### Long-running references to `Raw` slices

```python
def parse(buf: bytes) -> Envelope:
    return msgspec.json.decode(buf, type=Envelope)

env = parse(my_buffer)
my_buffer = None                          # ← original bytes gone
env.payload  # ← Raw view may now be invalid
```

Call `bytes(env.payload)` if you need to detach the Raw value from the source buffer.

## When NOT to use msgspec

| Need | Pick instead |
|---|---|
| Always-on validation on every constructor call | pydantic |
| Field-level validators with custom logic | pydantic, attrs |
| Heavy ORM integration (validators on rows) | attrs + cattrs, or your ORM's native model |
| FastAPI / web framework "request model" semantics | pydantic (FastAPI uses it natively) |
| You're already deep in a dataclasses-based codebase and won't switch | stick with dataclasses, use `msgspec.convert(obj, type=dataclass)` for boundaries |
| Schema-first with a code generator (Protobuf-style) | Protocol Buffers, Avro, etc. |

msgspec excels at high-throughput, type-driven serialization for code you own. It is not a validation framework, an ORM, or a schema-first generator.

## Library-vs-application choices

For **application-level** Structs (configs, internal events), default to:

- `kw_only=True`
- Annotated docstrings (top-level for class description, attribute docstrings for fields)
- Reused `Encoder` / `Decoder` if any encode/decode happens in a loop
- `Annotated[T, Meta(...)]` only where the constraint is meaningful at decode time

For **library-level** Structs you publish:

- Same as above, plus:
- Avoid `array_like=True` (breaks if users add fields)
- Avoid `forbid_unknown_fields=True` (breaks forward compat)
- Document field semantics with `description=` so generated JSON Schema is useful
- Use `tag=True` for variant types (more forgiving than `tag="literal"` if class is renamed)

## Comparison summary

| Concern | msgspec.Struct | dataclasses | pydantic | attrs |
|---|---|---|---|---|
| Encode/decode built-in | yes (4 formats) | no | yes (JSON) | no |
| Validation on `__init__` | no | no | yes | optional |
| Validation on decode | yes | n/a | yes | n/a |
| Encode/decode speed | fastest | n/a | slow | n/a |
| Construction speed | fastest | medium | slow | medium |
| Tagged unions | first-class | no | discriminator | no |
| Ecosystem (FastAPI etc.) | minimal | minimal | extensive | medium |
| Custom hook system | enc_hook/dec_hook | n/a | validators, serializers | converters, validators |

The takeaway: msgspec is the fastest serializer with built-in typing. Reach for it when serialization throughput matters and validation only at boundaries is enough.
