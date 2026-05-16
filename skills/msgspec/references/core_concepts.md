# Core Concepts

Deep dive into the Struct model, supported types, validation semantics, and how msgspec compares to similar libraries.

## What is a Struct

A `msgspec.Struct` is a typed, dataclass-like container implemented in C. The class body declares fields with type annotations and optional defaults; msgspec generates `__init__`, `__repr__`, `__eq__`, and (optionally) `__hash__`, `__lt__`/`__gt__`/etc.

```python
import msgspec
from msgspec import Struct

class Point(Struct):
    x: int
    y: int

p = Point(1, 2)             # Point(x=1, y=2)
p == Point(1, 2)            # True
```

Compared to `dataclasses.dataclass`, Structs are:

- **Faster.** `__init__`, attribute access, and `__eq__` are written in C.
- **Encodable.** First-class support in `msgspec.json` / `msgspec.msgpack` / `msgspec.yaml` / `msgspec.toml`.
- **Validated on decode.** Decoding raises `ValidationError` on type mismatch; assignment is not validated.
- **Stricter at definition.** Mutable non-empty defaults raise immediately. Required-before-optional ordering is enforced unless `kw_only=True`.

## Field declaration

Three forms, in increasing order of expressiveness:

```python
class C(Struct, kw_only=True):
    a: int                                          # required
    b: int = 0                                      # immutable default
    c: list = []                                    # empty mutable literal → factory
    d: dict = field(default_factory=dict)           # explicit factory
    e: str = field(default="x", name="encoded_e")   # rename in encoded form
```

Rules:

- A non-empty mutable literal (`[1, 2]`, `{"k": 1}`) as a default raises `TypeError`. Use `default_factory`.
- Empty mutable literals (`[]`, `{}`, `set()`, `bytearray()`) are sugar for `field(default_factory=type)`.
- Required fields must precede optional fields, unless `kw_only=True` is set on the class.
- `kw_only` is *strongly* preferred for non-trivial Structs — adding a required field later doesn't force a reorder.

## Supported type system

msgspec understands a wide set of Python types out of the box:

| Category | Types |
|---|---|
| Scalars | `None`, `bool`, `int`, `float`, `str`, `bytes`, `bytearray` |
| Numerics | `decimal.Decimal`, `enum.Enum`, `enum.IntEnum`, `enum.StrEnum` |
| Temporals | `datetime.datetime`, `datetime.date`, `datetime.time`, `datetime.timedelta` |
| Identity | `uuid.UUID` |
| Collections | `list[T]`, `tuple[T, ...]`, `tuple[A, B]`, `set[T]`, `frozenset[T]`, `dict[K, V]` |
| Typed shapes | `msgspec.Struct`, `dataclasses.dataclass`, `attrs` classes, `typing.NamedTuple`, `typing.TypedDict` |
| Constructs | `typing.Union`, `Optional`, `Literal`, `Annotated`, `typing.Any` |
| msgspec-only | `msgspec.Raw`, `msgspec.UnsetType` |

Wire-format mappings (the JSON column is the most common; binary formats may differ):

| Python type | JSON | MessagePack |
|---|---|---|
| `None` | `null` | nil |
| `bool` | `true`/`false` | bool |
| `int` | integer | int |
| `float` | number | float64 |
| `str` | string | str |
| `bytes` / `bytearray` | base64 string | bin |
| `datetime` | RFC3339 string | str |
| `date` / `time` | RFC3339 string | str |
| `timedelta` | ISO 8601 duration `"PT123S"` | str |
| `uuid.UUID` | RFC4122 string | str |
| `Decimal` | string (default) / number | str |
| `Enum` / `IntEnum` | enum value (str / int) | matches member type |
| `list` / `set` / `frozenset` | array | array |
| `tuple` | array | array |
| `dict` | object | map |
| `Struct` (default) | object | map |
| `Struct(array_like=True)` | array | array |
| `Raw` | inserted verbatim | inserted verbatim |
| `UNSET` field | omitted | omitted |

### Union semantics

A `Union[A, B, ...]` is decoded by inspecting the encoded value's shape:

- Multiple Struct members require **tagged unions** (`tag=True`). Otherwise msgspec cannot disambiguate two object-shaped values.
- At most one dict-like, one array-like, one int-like, and one string-like member is permitted per Union — the decoder must be able to pick by JSON kind alone.
- `Optional[T]` (i.e. `T | None`) is always supported and natural.

```python
# OK — distinguishable by kind
x: int | str | None | list[int]

# OK — tagged union
class A(Struct, tag=True): ...
class B(Struct, tag=True): ...
y: A | B

# ERROR — two untagged object-shaped types
# class A(Struct): ...
# class B(Struct): ...
# z: A | B
```

## The validation model

msgspec validates types **at the decode boundary**, not at construction:

```python
class Point(Struct):
    x: int
    y: int

# Construction: annotations not checked
Point(x="not-an-int", y=2)                 # OK at runtime; static checker may complain

# Decode: validated
msgspec.json.decode(b'{"x":"not-an-int","y":2}', type=Point)
# raises msgspec.ValidationError: Expected `int`, got `str` - at `$.x`

# Validate a manually-built dict
msgspec.convert({"x": 1, "y": 2}, type=Point)
# Point(x=1, y=2)
msgspec.convert({"x": "no", "y": 2}, type=Point)
# raises ValidationError
```

This split has two consequences:

1. **Fast construction.** No runtime cost when building Structs from already-typed Python code.
2. **Trusted vs untrusted boundary.** Treat `decode` / `convert` as the validation boundary. Everywhere else, you've opted out of runtime type-checking.

`msgspec.ValidationError` carries a JSON-Pointer-style location (`$.outer.inner[2].field`) so deeply-nested failures are debuggable. It's a subclass of `MsgspecError`. For details and patterns, see `validation.md`.

### Strict vs lax decoding

By default, `decode` / `convert` are **strict**: a JSON string is not silently coerced to an int. Pass `strict=False` to allow common coercions (string `"42"` → int 42):

```python
msgspec.json.decode(b'{"x":"42","y":2}', type=Point)                 # ValidationError
msgspec.json.decode(b'{"x":"42","y":2}', type=Point, strict=False)   # Point(x=42, y=2)
```

Use `strict=False` only on the very edge of the system (e.g. parsing CSV-like JSON from a flaky producer).

## Wire-format selection

| Format | When |
|---|---|
| `msgspec.json` | Universal default. Human-readable, widely interoperable. |
| `msgspec.msgpack` | Compact binary. Faster encode/decode than JSON; useful for IPC, caching, network protocols. |
| `msgspec.yaml` | Config files for humans. Slower (YAML parsing is hard). Requires `pyyaml`. |
| `msgspec.toml` | Config files with stricter syntax. Note: TOML cannot represent `None` at top level or in arrays. Requires `tomli_w` to encode. |

Speed roughly: msgpack > json > toml > yaml.

## Comparison with similar libraries

| Concern | msgspec.Struct | dataclasses | pydantic | attrs |
|---|---|---|---|---|
| Encode/decode built-in | yes (multi-format) | no (use `msgspec.convert`) | yes (json only) | no |
| Validation on `__init__` | no | no | yes | optional |
| Validation on decode | yes | n/a | yes | n/a |
| Speed (encode/decode) | fastest | n/a | slow | n/a |
| Construction speed | fastest | medium | slow | medium |
| Tagged unions | first-class | no | discriminator field | no |
| Frozen / immutable | optional | optional | optional | optional |
| Generic types (`Generic[T]`) | yes | yes | yes | yes |
| Plugin / hook ecosystem | minimal | minimal | extensive | medium |

**Pick msgspec when**: you own the schema, throughput matters, you want one library to cover JSON/msgpack/YAML/TOML, and validation only at boundaries is acceptable.

**Don't pick msgspec when**: you need always-on validation on every constructor call (`MyModel(...)` raises immediately), or you depend heavily on pydantic-specific ecosystem features (FastAPI request models, validators on every assignment, etc.).

## Where msgspec stops

- **No runtime validators per-field** (pydantic-style `@validator`). Use `__post_init__` for cross-field validation; raise `ValueError` / `TypeError` to surface as `ValidationError`.
- **No automatic re-validation on assignment.** `point.x = "no"` succeeds silently.
- **No schema migration framework.** Schema evolution is handled by giving new fields defaults and tolerating unknown fields on decode (see `advanced.md`).
- **No async runtime.** Codecs are sync — wrap calls in `asyncio.to_thread` if encode/decode bytes dominate.

## What "decode boundary" means in practice

Think of `decode` / `convert` as the entry point where untrusted data becomes a typed Struct. Everywhere downstream, the Struct is trusted and not re-validated. This is why msgspec is so fast: validation is concentrated at one point, not amortized across every attribute access.

```python
# Boundary: validate once
config = msgspec.json.decode(raw_bytes, type=Config)

# Trusted: everything below operates on a valid Config
run_training(config)
```

If you need to coerce data that's already in Python (a dict from another library), pass it through `msgspec.convert`:

```python
config = msgspec.convert(raw_dict, type=Config)
```
