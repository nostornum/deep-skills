# Advanced

Tagged unions (polymorphic decoding), `msgspec.Raw` (deferred decoding), `UNSET` (missing-vs-null), generic Structs, schema evolution, JSON Schema generation.

## Tagged unions

A `Union` of multiple `Struct` types cannot be disambiguated by shape alone — both encode as JSON objects. **Tagged unions** add a discriminator field that selects the variant.

### Basic tag

```python
import msgspec
from msgspec import Struct
from typing import Union

class Cat(Struct, tag=True):
    name: str

class Dog(Struct, tag=True):
    name: str
    breed: str

dec = msgspec.json.Decoder(Union[Cat, Dog])

dec.decode(b'{"type":"Cat","name":"Whiskers"}')             # Cat(name='Whiskers')
dec.decode(b'{"type":"Dog","name":"Rex","breed":"Husky"}')  # Dog(name='Rex', breed='Husky')
```

`tag=True` means the tag value is the class name. The default discriminator field is `"type"`.

### Custom tag values

| Form | Tag value |
|---|---|
| `tag=True` | Class name (e.g. `"LogitNormal"`) |
| `tag="literal-string"` | The literal string |
| `tag=42` | The literal int |
| `tag=str.lower` | Class name passed through the callable (e.g. `"logitnormal"`) |
| `tag=lambda n: n.replace("_", "-").lower()` | Arbitrary transform |

### Custom tag field

```python
class Shape(Struct, tag_field="kind", tag=str.lower):
    pass

class Square(Shape):
    side: float

class Circle(Shape):
    radius: float

msgspec.json.encode(Square(side=2.0))
# b'{"kind":"square","side":2.0}'
```

Setting `tag` / `tag_field` on a base class propagates to subclasses. This is the cleanest way to ensure all variants in a union share the discriminator setup.

### Constraints

- All variants in the union must agree on `tag_field` (same name).
- All variants must use the same tag *type* (all strings or all ints, not mixed).
- Each variant must have a unique tag value.
- The tag field name must not collide with a regular field on any variant.

### Decoder caching

Constructing `Decoder(Union[A, B, C, ...])` compiles a dispatch table keyed by tag value. Reuse the Decoder instance — building it for large unions is the expensive step.

## `msgspec.Raw` — deferred decoding

A `Raw` field holds the encoded bytes for a region without decoding them. The bytes are a zero-copy slice into the input buffer (until the Raw escapes the decode call site).

### Two-pass dispatch

```python
import msgspec
from msgspec import Struct, Raw
from typing import Union

class Envelope(Struct):
    kind: str
    payload: Raw

class FooBody(Struct):
    x: int

class BarBody(Struct):
    y: str

DISPATCH = {"foo": FooBody, "bar": BarBody}

def decode_message(buf: bytes) -> Union[FooBody, BarBody]:
    env = msgspec.json.decode(buf, type=Envelope)
    body_type = DISPATCH[env.kind]
    return msgspec.json.decode(env.payload, type=body_type)

decode_message(b'{"kind":"foo","payload":{"x":42}}')   # FooBody(x=42)
```

Use when:

- The type of one field depends on another field's value (manual dispatch, not a tagged union).
- Forwarding a sub-document untouched (avoids decode-then-re-encode round-trip).
- Validating one part of a message while leaving the rest as opaque bytes.

### Embedding raw bytes during encode

```python
fragment = msgspec.Raw(b'[1,2,3]')                  # pre-encoded JSON
msgspec.json.encode({"data": fragment})             # b'{"data":[1,2,3]}'
```

The bytes are copied into the output verbatim — no parsing, no validation. Useful when forwarding pre-serialized JSON fragments without re-parsing them.

`msgspec.Raw()` with no args creates a zero-length raw value.

### Lifetime warning

A `Raw` decoded from a buffer holds a zero-copy view into that buffer. If you keep the `Raw` past the lifetime of the buffer (e.g. recv'd bytes are discarded), the underlying memory may become invalid. To detach, call `bytes(raw_value)`.

## `UNSET` / `UnsetType` — distinguish missing vs null

JSON has two notions of absent: `null` and "key omitted". Standard Python collapses both to `None`. `UNSET` reintroduces the distinction.

```python
import msgspec
from msgspec import Struct, UNSET, UnsetType

class Patch(Struct, kw_only=True):
    name: str | None | UnsetType = UNSET
    score: float | None | UnsetType = UNSET

# Encoding: UNSET fields are omitted entirely
msgspec.json.encode(Patch(name="alice"))    # b'{"name":"alice"}'
msgspec.json.encode(Patch(name=None))       # b'{"name":null}'
msgspec.json.encode(Patch())                # b'{}'

# Decoding: missing field → UNSET, null field → None
p = msgspec.json.decode(b'{"name":null}', type=Patch)
assert p.name is None
assert p.score is UNSET
```

### UNSET semantics

- `UNSET` is a singleton instance of `UnsetType` (an `enum`).
- `bool(UNSET) is False` — usable in `if patch.field:` checks.
- Use `is UNSET` for explicit checks (`patch.field is UNSET`), not `==`.
- `UNSET` always serializes as field-omission, regardless of `omit_defaults`.

### Patch / partial-update pattern

```python
class UserPatch(Struct, kw_only=True):
    name: str | UnsetType = UNSET
    email: str | None | UnsetType = UNSET           # can also set explicitly to None
    is_admin: bool | UnsetType = UNSET

def apply_patch(user: User, patch: UserPatch) -> User:
    changes = {f: v for f, v in vars(patch).items() if v is not UNSET}
    return msgspec.structs.replace(user, **changes)
```

This cleanly separates "field omitted" (don't change) from "field set to null" (clear the value).

## Generic Structs

`Struct` supports `Generic[T]` parameterization. Type variables are resolved at decode time.

```python
from typing import Generic, TypeVar
import msgspec

T = TypeVar("T")

class Page(msgspec.Struct, Generic[T]):
    page: int
    total: int
    items: list[T]

class Article(msgspec.Struct):
    title: str
    slug: str

# Parametrize at the decode site — each parametrization is a distinct schema
dec_articles = msgspec.json.Decoder(Page[Article])
dec_strings = msgspec.json.Decoder(Page[str])

result = dec_articles.decode(
    b'{"page":1,"total":5,"items":[{"title":"Hi","slug":"hi"}]}'
)
# Page(page=1, total=5, items=[Article(title='Hi', slug='hi')])
```

### Defaults and bounds

```python
T = TypeVar("T", bound=msgspec.Struct, default=msgspec.Struct)

class Wrapper(Struct, Generic[T]):
    payload: T
```

`bound=` constrains valid parameterizations. `default=` (PEP 696) provides a fallback when `Wrapper` is used unparametrized.

### Unparametrized usage

```python
dec_any = msgspec.json.Decoder(Page)        # T resolves to Any (or T's default)
```

When unparametrized, type variables fall back to their `default=` (if any) or `Any`. The decoder then accepts any value for `items`.

### Runtime parametrization

`Page[Article]` is a real runtime expression — you can store it in a dict, generate it dynamically:

```python
decoders = {item_type: msgspec.json.Decoder(Page[item_type]) for item_type in TYPES}
```

## Schema evolution

msgspec's defaults are forward-compatible: unknown fields are silently dropped on decode. Following a few rules lets you grow a schema without breaking old readers.

### Rules

| Rule | Detail |
|---|---|
| Add fields only with defaults | New required fields break old encoded data. Always provide a default. |
| Never change a field's type | Changing `int` → `str` breaks both directions. Add a new field, keep the old. |
| `array_like=True` ordering is permanent | Never reorder fields. Append only. Extra trailing items from newer encoders are dropped silently. |
| Renaming fields needs a `rename` map | Or keep the old field with its original name and add a new alias field. |
| Default unknown-field handling is silent | Leave it that way for public APIs. `forbid_unknown_fields=True` only for internal-controlled schemas. |
| Version tagging via a field | Add `version: int = 1` with `omit_defaults=True`. Old schemas ignore it; new schemas gate behavior on it (in `__post_init__`). |

### Worked example

```python
# v1
class UserV1(Struct):
    name: str
    email: str | None = None

# v2: add a field
class UserV2(Struct):
    name: str
    email: str | None = None
    phone: str | None = None        # NEW — must have a default

# Old data decodes cleanly into the new schema
old_buf = msgspec.json.encode(UserV1(name="alice"))
msgspec.json.decode(old_buf, type=UserV2)
# UserV2(name='alice', email=None, phone=None)

# New data decodes cleanly into the old schema (phone silently dropped)
new_buf = msgspec.json.encode(UserV2(name="bob", phone="555-1234"))
msgspec.json.decode(new_buf, type=UserV1)
# UserV1(name='bob', email=None)
```

### Migration via tagged unions

For larger schema changes, version the whole shape with a tagged union:

```python
class UserV1(Struct, tag="v1"):
    name: str

class UserV2(Struct, tag="v2"):
    name: str
    email: str | None = None

User = Union[UserV1, UserV2]
dec = msgspec.json.Decoder(User)
# Producers stamp tag="v1" or "v2"; consumers handle both explicitly.
```

This is more invasive but makes version handling explicit at every call site.

## JSON Schema generation

```python
schema = msgspec.json.schema(
    type: Any, *,
    schema_hook: Callable[[type], dict] | None = None,
    ref_template: str = "#/$defs/{name}",
) -> dict[str, Any]

schemas, components = msgspec.json.schema_components(
    types: Iterable[Any], *,
    schema_hook: Callable[[type], dict] | None = None,
    ref_template: str = "#/$defs/{name}",
) -> tuple[tuple[dict, ...], dict[str, Any]]
```

### Single-type schema

```python
class Product(Struct):
    """A catalog product."""
    id: int
    name: str
    price: Annotated[float, Meta(gt=0, description="Must be positive")]
    tags: set[str] = set()

schema = msgspec.json.schema(list[Product])
# {"type":"array","items":{"$ref":"#/$defs/Product"},"$defs":{"Product":{...}}}
```

The schema is JSON Schema 2020-12 compatible. `Meta(title=...)`, `description`, `examples`, and `extra_json_schema` flow through. Class docstrings become `description` on the type.

### OpenAPI-style components

```python
schemas, components = msgspec.json.schema_components(
    [UserCreate, UserResponse, Error],
    ref_template="#/components/schemas/{name}",
)

openapi = {
    "openapi": "3.1.0",
    "components": {"schemas": components},
    "paths": {
        "/users": {
            "post": {
                "requestBody": {
                    "content": {"application/json": {"schema": schemas[0]}}
                },
                "responses": {
                    "200": {"content": {"application/json": {"schema": schemas[1]}}}
                },
            }
        }
    },
}
```

`schemas[i]` corresponds to `types[i]`; `components` holds shared `$defs` referenced by `$ref`.

### Custom schema hook

For types msgspec can't introspect (third-party objects, ones registered via `dec_hook`), supply a `schema_hook`:

```python
import pathlib

def schema_hook(tp: type) -> dict:
    if tp is pathlib.Path:
        return {"type": "string", "format": "path"}
    raise NotImplementedError(tp)

msgspec.json.schema(MyStruct, schema_hook=schema_hook)
```

The hook is consulted when msgspec encounters a type it doesn't recognize. `raise NotImplementedError` for types you don't handle — the error includes the unrecognized type in the message.

## `msgspec.inspect` — type introspection

For low-level tools (custom code generators, IDE integrations):

```python
from msgspec.inspect import type_info

info = type_info(MyStruct)
# Returns a StructType with .fields, each carrying .name, .type, .required, ...
```

`type_info` resolves `Annotated`, generics, and unions into a structured representation. The exact shape is documented in the msgspec API docs; `msgspec.inspect` is the underlying API used by `schema_components` and the `Meta` system.
