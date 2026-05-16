# Validation & Constraints

`Meta` constraints, `ValidationError` handling, `convert` / `to_builtins`, and `__post_init__` as a validator.

## Constraint primitives: `msgspec.Meta`

Attach constraints to types with `Annotated[T, Meta(...)]`. `Meta` is metadata; it works on Struct fields, function parameters, and anywhere `Annotated` is accepted.

```python
from typing import Annotated
from msgspec import Meta, Struct

PositiveInt   = Annotated[int, Meta(gt=0)]
ProbFloat     = Annotated[float, Meta(ge=0.0, le=1.0)]
ShortStr      = Annotated[str, Meta(min_length=1, max_length=64)]
UnixName      = Annotated[str, Meta(pattern="^[a-z_][a-z0-9_-]*$")]
BoundedList   = Annotated[list[int], Meta(min_length=1, max_length=10)]
```

Type aliases let you reuse a constrained type across many Structs without repeating the annotation.

### Full Meta parameter list

| Param | Applies to | Meaning |
|---|---|---|
| `gt` | `int`, `float` | value strictly greater than |
| `ge` | `int`, `float` | value greater or equal |
| `lt` | `int`, `float` | value strictly less than |
| `le` | `int`, `float` | value less or equal |
| `multiple_of` | `int`, `float` | divisible by; avoid non-integral floats (floating-point error) |
| `pattern` | `str` | regex; **unanchored** — add `^` / `$` to anchor |
| `min_length` | `str`, `bytes`, `list`, `tuple`, `set`, `frozenset`, `dict` | inclusive minimum length |
| `max_length` | same | inclusive maximum length |
| `tz` | `datetime`, `time` | `True` = require aware, `False` = require naive, `None` = either |
| `title` | any | JSON Schema `title` |
| `description` | any | JSON Schema `description` |
| `examples` | any | JSON Schema `examples` list |
| `extra_json_schema` | any | merged verbatim into generated JSON Schema |
| `extra` | any | arbitrary metadata; emitted only via `msgspec.inspect`, **not** in JSON Schema |

Use `title` / `description` / `examples` when you generate JSON Schema for an API — these flow through to the schema output.

### Combining constraints

A single `Meta(...)` can carry many constraints together:

```python
ServerName = Annotated[
    str,
    Meta(
        min_length=1,
        max_length=63,
        pattern="^[a-z][a-z0-9-]*$",
        description="DNS-safe lowercase hostname",
    ),
]
```

You can also stack multiple `Meta` annotations; they are merged:

```python
Bounded = Annotated[int, Meta(ge=0), Meta(le=100)]
```

### Worked example

```python
from typing import Annotated
from msgspec import Meta, Struct

class Resource(Struct, kw_only=True):
    name: Annotated[str, Meta(pattern="^[a-z_][a-z0-9_-]*$", max_length=63)]
    replicas: Annotated[int, Meta(ge=1, le=100)] = 1
    cpu: Annotated[float, Meta(gt=0.0, le=64.0)] = 0.5
    tags: Annotated[list[str], Meta(max_length=10)] = []
    description: Annotated[str, Meta(max_length=256)] | None = None

try:
    msgspec.json.decode(b'{"name":"bad name","replicas":200}', type=Resource)
except msgspec.ValidationError as exc:
    print(exc)
    # Expected `str` matching regex '^[a-z_][a-z0-9_-]*$' - at `$.name`
```

## ValidationError

```python
class msgspec.MsgspecError(Exception): ...
class msgspec.DecodeError(MsgspecError): ...
class msgspec.ValidationError(DecodeError): ...
class msgspec.EncodeError(MsgspecError): ...
```

`ValidationError` is raised on type or constraint mismatches during `decode` / `convert`. The error message includes a JSON-Pointer-style location:

```
Expected `int` >= 1 - at `$.replicas`
```

`$` is the document root; `.field` and `[index]` paths to the failure point. This makes nested errors easy to act on.

```python
try:
    cfg = msgspec.json.decode(raw, type=Config)
except msgspec.ValidationError as exc:
    return {"error": "invalid_config", "detail": str(exc)}
except msgspec.DecodeError as exc:
    # Malformed input (not even valid JSON)
    return {"error": "malformed", "detail": str(exc)}
```

Catch `ValidationError` for "structure / types / constraints"; catch `DecodeError` (the parent) when you also want to handle malformed bytes.

## `forbid_unknown_fields`

By default, unknown keys are silently skipped during decode — this is the safe default for forward-compatible schemas. For strict / internal protocols, opt in:

```python
class Strict(Struct, forbid_unknown_fields=True):
    x: int
    y: int

msgspec.json.decode(b'{"x":1,"y":2,"oops":3}', type=Strict)
# ValidationError: Object contains unknown field `oops`
```

Recommended uses:

- IPC between processes you control.
- Tests where typo'd fields should fail loudly.
- Detecting drift between server / client versions.

Avoid in public APIs — strict-mode breaks forward compatibility (adding a field on the server breaks older clients).

## `msgspec.convert`

Validate / coerce an already-built Python object (not bytes) into a Struct.

```python
msgspec.convert(
    obj: Any,
    type: Type[T], *,
    strict: bool = True,
    from_attributes: bool = False,
    dec_hook: Callable[[type, Any], Any] | None = None,
    builtin_types: Iterable[type] | None = None,
    str_keys: bool = False,
) -> T
```

Common uses:

```python
# Dict → Struct
cfg = msgspec.convert({"name": "run", "lr": 1e-3}, type=Config)

# List of dicts → list of Structs
runs = msgspec.convert(
    [{"name": "a", "lr": 1e-3}, {"name": "b", "lr": 1e-4}],
    type=list[Config],
)

# ORM-style object → Struct (uses getattr)
cfg = msgspec.convert(orm_row, type=Config, from_attributes=True)
```

`from_attributes=True` makes msgspec pull fields via `getattr` instead of dict lookup. Useful for ORM rows (`SQLAlchemy`, `Django`), or any object that exposes its fields as attributes.

`strict=False` allows the same coercions as `decode(strict=False)`.

## `msgspec.to_builtins`

Recursively convert a Struct (or any supported object) to plain Python builtins — dicts, lists, scalars. Use for `json.dumps`, logging, debug printing.

```python
msgspec.to_builtins(
    obj: Any, *,
    str_keys: bool = False,
    builtin_types: Iterable[type] | None = None,
    enc_hook: Callable[[Any], Any] | None = None,
    order: Literal[None, "deterministic", "sorted"] = None,
) -> Any
```

```python
import json

class Config(Struct):
    name: str
    nested: dict

cfg = Config(name="run", nested={"a": 1})
plain = msgspec.to_builtins(cfg)        # {"name": "run", "nested": {"a": 1}}
json.dumps(plain)                       # works with stdlib json
```

`to_builtins` vs `structs.asdict`:

- `asdict` is **shallow** — nested Structs remain Structs.
- `to_builtins` is **deep** — fully recursive, returns only plain builtins.

Use `to_builtins` when sending to a library that doesn't understand Structs (stdlib `json`, `pandas`, wandb logging).

## `__post_init__` as validator

For cross-field invariants, override `__post_init__`. Raising `ValueError` or `TypeError` during decode surfaces as `ValidationError`.

```python
class Range(Struct):
    lo: int
    hi: int

    def __post_init__(self) -> None:
        if self.lo > self.hi:
            raise ValueError(f"lo ({self.lo}) > hi ({self.hi})")

msgspec.json.decode(b'{"lo":5,"hi":3}', type=Range)
# ValidationError: lo (5) > hi (3)
```

`__post_init__` runs on **every** construction:

1. Manual `Range(lo=5, hi=3)` → raises `ValueError` directly.
2. `msgspec.json.decode(...)` → raises `ValidationError` (wrapping the `ValueError`).
3. `msgspec.convert(...)` → same as decode.

Implications:

- Don't put expensive side effects in `__post_init__` — it runs on every decode.
- For multi-step validation, raise on the first issue; msgspec includes only one error in the location.

## Patterns for nested validation

`Meta` constraints attach to types, not to fields. To validate a nested structure, declare the constraint on the inner type:

```python
class Item(Struct):
    quantity: Annotated[int, Meta(ge=1)]

class Order(Struct):
    items: Annotated[list[Item], Meta(min_length=1, max_length=100)]
```

The error path will reach into the nest: `$.items[3].quantity`.

## Generating runtime-validation alternatives

For codepaths where you need pydantic-style "validate on every assignment", msgspec is not the right tool. Two workarounds:

1. **Frozen Structs** prevent later assignment, sidestepping the need to re-validate.
2. **Explicit validation step** in a setter or property — but at that point you've reinvented pydantic.

If always-on validation is critical, mix msgspec (for the encode/decode boundary) with a hand-written wrapper around the Struct, or pick pydantic.

## ValidationError serialization

`ValidationError` is a regular Python exception — `str(exc)` gives the human message. For API responses, wrap it:

```python
def to_error_response(exc: msgspec.ValidationError) -> dict:
    msg = str(exc)
    # Format: "Expected `int` - at `$.x.y`"
    location = msg.rsplit(" - at `", 1)[-1].rstrip("`") if " - at `" in msg else "$"
    return {"error": "validation_failed", "field": location, "message": msg}
```

msgspec does not expose a structured representation of the error — only the formatted message. If you need rich error info (failing value, expected type), wrap and re-raise from your decode call site.

## Meta + JSON Schema generation

`Meta.title`, `Meta.description`, `Meta.examples`, and `Meta.extra_json_schema` flow through to the JSON Schema produced by `msgspec.json.schema`. See `advanced.md` for the schema generation pattern.

```python
class Resource(Struct):
    """A managed resource."""
    name: Annotated[
        str,
        Meta(
            pattern="^[a-z_][a-z0-9_-]*$",
            description="DNS-safe identifier",
            examples=["my-resource", "user_abc"],
        ),
    ]

schema = msgspec.json.schema(Resource)
# Includes 'pattern', 'description', 'examples' verbatim in the schema
```
