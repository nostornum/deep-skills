# Structs Reference

Full surface for the `Struct` class, `msgspec.field()`, and the `msgspec.structs.*` helpers.

## `msgspec.Struct` class kwargs

Pass via class-body syntax: `class C(Struct, kw_only=True, frozen=True): ...`

| kwarg | Type | Default | Purpose |
|---|---|---|---|
| `kw_only` | `bool` | `False` | All fields become keyword-only in `__init__`. Removes required-before-optional ordering rule. |
| `frozen` | `bool` | `False` | Disables attribute mutation after `__init__`. Adds `__hash__` (all fields must be hashable). |
| `eq` | `bool` | `True` | Generate `__eq__` / `__ne__` based on field values. `False` → identity equality. |
| `order` | `bool` | `False` | Generate `__lt__`/`__le__`/`__gt__`/`__ge__` comparing fields as a tuple. |
| `tag` | `None / bool / str / int / Callable[[str], str\|int]` | `None` | Enable tagged unions. `True` → use class name; `str.lower` → lowercased name; literal → that exact value. |
| `tag_field` | `str / None` | `None` (defaults to `"type"` when tagged) | Name of the discriminator field in the encoded form. |
| `rename` | `None / "lower" / "upper" / "camel" / "pascal" / "kebab" / Mapping[str,str] / Callable` | `None` | Rename fields **on the wire only**. Python attribute names are unchanged. |
| `omit_defaults` | `bool` | `False` | Skip encoding fields whose value matches the default. Smaller payloads. |
| `forbid_unknown_fields` | `bool` | `False` | Raise `ValidationError` on unknown keys during decode. Default: silently skip. |
| `array_like` | `bool` | `False` | Encode/decode as JSON array (not object). ~2x decode speedup. Field order becomes a wire-format contract. |
| `gc` | `bool` | `True` | Whether instances participate in Python's cyclic garbage collector. Set `False` only when cycles are impossible. |
| `cache_hash` | `bool` | `False` | Cache `__hash__` (only useful with `frozen=True`). |
| `dict` | `bool` | `False` | Give instances a `__dict__` — allows arbitrary attribute assignment outside declared fields. |
| `weakref` | `bool` | `False` | Allow `weakref.ref(instance)`. |
| `repr_omit_defaults` | `bool` | `False` | Omit fields at their defaults from `__repr__` output. |

## `msgspec.field()`

```python
msgspec.field(
    *,
    default: Any = NODEFAULT,
    default_factory: Callable[[], Any] = NODEFAULT,
    name: str | None = None,
) -> Any
```

| kwarg | Purpose |
|---|---|
| `default` | Static default value. Cannot be combined with `default_factory`. |
| `default_factory` | Zero-arg callable producing a fresh default per instance. Required for mutable defaults. |
| `name` | Override encode/decode name for this single field. Useful for reserved-word fields (`"class"`, `"type"`). |

Provide at most one of `default` / `default_factory`. If both are omitted but `name=...` is set, the field is required from the CLI/wire side but renamed.

### Default rules

```python
class C(Struct, kw_only=True):
    a: int                                          # required (no default)
    b: int = 0                                      # static default
    c: list = []                                    # OK — empty literal sugar
    d: dict = {}                                    # OK — empty literal sugar
    e: set = set()                                  # OK — empty literal sugar

    # f: list = [1, 2]                              # ERROR — non-empty mutable
    g: list = field(default_factory=lambda: [1, 2]) # correct way

    h: int = field(default=0, name="encoded_h")     # rename only this field
```

Static default values are deep-frozen into the class. They must be hashable / immutable; using mutable values like `field(default={...})` raises.

## `msgspec.structs` helpers

```python
import msgspec
from msgspec import structs
```

| Helper | Purpose |
|---|---|
| `structs.asdict(struct) -> dict[str, Any]` | Shallow conversion: top-level fields → dict, nested Structs preserved. |
| `structs.astuple(struct) -> tuple[Any, ...]` | Field values in declaration order. |
| `structs.replace(struct, **changes) -> S` | Non-mutating copy with overrides (like `dataclasses.replace`). Validates `changes` keys against the schema. |
| `structs.fields(type_or_instance) -> tuple[FieldInfo, ...]` | Introspect declared fields. |
| `structs.force_setattr(struct, name, value) -> None` | Bypass `frozen=True`. Advanced use — caches and `__hash__` may become stale. |

### `FieldInfo`

Returned by `structs.fields`. Attributes:

| Attribute | Meaning |
|---|---|
| `name` | Python attribute name. |
| `encode_name` | Name used in the encoded form (after `rename` / `field(name=...)`). |
| `type` | Annotation type. |
| `default` | Default value, or `msgspec.NODEFAULT`. |
| `default_factory` | Default factory, or `msgspec.NODEFAULT`. |
| `required` (property) | `True` if neither `default` nor `default_factory` is set. |

```python
class Config(Struct, kw_only=True):
    lr: float = 1e-3
    name: str = field(default="run", name="run_name")

for f in structs.fields(Config):
    print(f.name, "→", f.encode_name, "required=", f.required)
# lr → lr required= False
# name → run_name required= False
```

## Common patterns

### kw-only everywhere

The single most useful default. Avoids "default before required" errors when you add a required field later.

```python
class TrainingConfig(Struct, kw_only=True):
    batch_size: int = 32
    epochs: int = 10
    run_name: str                              # add later, no reorder needed
```

### Frozen + cache_hash for dict keys

```python
class Coord(Struct, frozen=True, cache_hash=True):
    x: int
    y: int

cache: dict[Coord, str] = {}
cache[Coord(1, 2)] = "origin"
```

### `omit_defaults` for partial updates / patches

```python
class UserPatch(Struct, kw_only=True, omit_defaults=True):
    name: str | None = None
    email: str | None = None

msgspec.json.encode(UserPatch(name="alice"))   # b'{"name":"alice"}'  — email omitted
msgspec.json.encode(UserPatch())               # b'{}'                — both omitted
```

For "field explicitly set to null" vs "field not provided", use `UNSET` (see `advanced.md`).

### `rename` for API integration

```python
class GitHubRelease(Struct, rename="camel"):
    tag_name: str
    is_prerelease: bool
    created_at: datetime
# wire: {"tagName": ..., "isPrerelease": ..., "createdAt": ...}
```

Aliases: `"lower"`, `"upper"`, `"camel"`, `"pascal"`, `"kebab"`. For irregular maps (e.g. matching an OpenAPI spec that uses both camelCase and snake_case inconsistently), pass an explicit `dict`:

```python
class Resource(Struct, rename={"resource_id": "ID", "etag": "ETag"}):
    resource_id: str
    etag: str
    name: str
```

### `array_like` for compact / fixed-shape encoding

```python
class Point(Struct, array_like=True, frozen=True):
    x: float
    y: float

msgspec.json.encode(Point(1.0, 2.0))           # b'[1.0,2.0]'
msgspec.json.decode(b'[3.0,4.0]', type=Point)  # Point(x=3.0, y=4.0)
```

Wire ordering is fixed by field order. Reordering fields in source code breaks compatibility with previously-encoded data — comment loudly.

### `dict=True` and `weakref=True`

Default Structs use `__slots__`, so you cannot assign attributes not declared on the class. Set `dict=True` to allow it; `weakref=True` to support `weakref.ref(instance)`. Both add per-instance overhead and are usually unnecessary.

## Construction and equality

Auto-generated `__init__` accepts fields as either positional or keyword (unless `kw_only=True`):

```python
class P(Struct):
    x: int
    y: int

P(1, 2)             # OK
P(x=1, y=2)         # OK
P(1, y=2)           # OK
```

`__eq__` is generated unless `eq=False`. Equality compares field values only, not types:

```python
class A(Struct): x: int
class B(Struct): x: int
A(1) == B(1)        # False — different types
A(1) == A(1)        # True
```

`__repr__` includes all fields, except defaults if `repr_omit_defaults=True`:

```python
class C(Struct, kw_only=True, repr_omit_defaults=True):
    a: int = 1
    b: int = 2

C(a=5)              # C(a=5)   ← b omitted
C(a=5, b=3)         # C(a=5, b=3)
```

## Inheritance

A Struct can inherit from another Struct. Fields are concatenated; class-level kwargs propagate unless overridden:

```python
class Base(Struct, kw_only=True, frozen=True):
    id: str
    created_at: datetime

class User(Base):
    name: str
    email: str | None = None

# User has fields: id, created_at, name, email; inherits frozen=True
```

`tag` and `tag_field` are inherited — useful for tagged-union hierarchies (see `advanced.md`).

## `__post_init__`

Optional hook called after `__init__` (and after decoding). Use for cross-field validation or derived state:

```python
class Range(Struct):
    lo: int
    hi: int

    def __post_init__(self) -> None:
        if self.lo > self.hi:
            raise ValueError(f"lo ({self.lo}) > hi ({self.hi})")
```

Raising `TypeError` or `ValueError` in `__post_init__` during decode surfaces as a `ValidationError`. Other exceptions propagate as-is.

Note: `__post_init__` runs on **every** Struct construction, including ones created by `decode` and `convert`. Avoid expensive side effects.

## Gotchas

- **Required-before-optional ordering.** Without `kw_only=True`, the error message is clear but easy to hit. Just always use `kw_only=True`.
- **Mutable non-empty defaults.** `field(default=[1, 2])` raises `TypeError`. Use `default_factory`.
- **`__init__` does not validate types.** `Point(x="oops", y=1)` succeeds. Only `decode` / `convert` validate.
- **`tag_field` collisions.** If a Struct has a field literally named `type` (the default tag field), set a different `tag_field`.
- **`frozen` blocks `setattr`, not `__init__`.** Frozen Structs are fully initialized through `__init__`; freezing kicks in afterwards. `structs.force_setattr` is the escape hatch.
- **`array_like=True` is a wire-format contract.** Field reorders silently corrupt data. Consider freezing the wire schema with an explicit comment block.
- **`rename` does not affect Python code.** `cfg.first_name` works; `cfg.firstName` raises `AttributeError`.
- **`cache_hash=True` is useless without `frozen=True`** — and the constructor will reject the combination.
