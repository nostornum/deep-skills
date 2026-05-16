---
name: msgspec
description: Fast, validated serialization library for Python. Use when defining typed config classes, API payloads, event schemas, or IPC messages where throughput matters. Provides `Struct` (a C-backed dataclass-like type) plus JSON, MessagePack, YAML, and TOML codecs with schema-driven validation at the decode boundary.
license: MIT
metadata:
  version: "1.0"
  upstream: https://github.com/jcrist/msgspec
---

# msgspec

## Overview

msgspec is a fast, validated serialization library built around `Struct`, a C-backed dataclass-like type. It provides JSON, MessagePack, YAML, and TOML codecs that decode directly into validated, typed Python objects. Validation happens only at the decode boundary, so attribute access stays cheap. Common uses: typed configs, network payloads, event schemas, IPC messages, log records.

## Quick start

Install (the JSON / MessagePack core has no dependencies):

```
uv pip install msgspec                  # core
uv pip install msgspec[yaml,toml]       # add YAML / TOML codecs
```

Define a Struct, encode it, decode it back:

```python
import msgspec
from msgspec import Struct, field

class Config(Struct, kw_only=True):
    name: str
    lr: float = 1e-3
    epochs: int = 10
    tags: list[str] = []                       # empty mutable literal is safe

cfg = Config(name="run-1", lr=5e-4)

buf = msgspec.json.encode(cfg)                 # b'{"name":"run-1","lr":0.0005,...}'
cfg2 = msgspec.json.decode(buf, type=Config)   # validated Config instance
```

## Core concepts

### Struct

A `Struct` is a typed, mutable, dataclass-like object implemented in C. Fields are declared with annotations and optional defaults. Required fields must precede optional ones — or set `kw_only=True` to lift that constraint.

```python
class User(Struct, kw_only=True):
    name: str                                  # required
    email: str | None = None                   # optional
    groups: set[str] = set()                   # empty mutable literal → default_factory
    uid: int = field(default_factory=lambda: 0)
```

**Key principles:**

- Type annotations are the schema. They drive encoding, decoding, validation, and `__repr__`.
- `__init__`, `__eq__`, `__repr__` are auto-generated.
- Direct attribute assignment is **not** validated. Validation runs in `decode` / `convert`.
- Mutable defaults: use `field(default_factory=...)` or the empty-literal sugar (`[]`, `{}`, `set()`).
- `kw_only=True` removes the required-before-optional ordering rule.

### Validation model

Validation is decode-only:

```python
Point = msgspec.Struct
class Point(Struct):
    x: int
    y: int

Point(x=1, y="oops")                           # OK — annotations not checked at init
msgspec.json.decode(b'{"x":1,"y":"oops"}', type=Point)
# msgspec.ValidationError: Expected `int`, got `str` - at `$.y`
```

To validate an already-built dict, use `msgspec.convert`:

```python
msgspec.convert({"x": 1, "y": 2}, type=Point)  # Point(x=1, y=2)
```

For detailed concepts and the type-system, load `references/core_concepts.md`.

## Defining structs

Common `Struct` class options:

| Option | Use case |
|---|---|
| `kw_only=True` | Always — sidesteps default ordering issues, makes call sites self-documenting. |
| `frozen=True` | Hashable, immutable — use as dict keys or in sets. |
| `tag=True` (or `tag="name"`) | Tagged union variant. |
| `rename="camel"` | API responses with camelCase keys. |
| `omit_defaults=True` | Patch / partial update payloads. |
| `forbid_unknown_fields=True` | Strict schemas (internal protocols). |
| `array_like=True` | Compact arrays, ~2x faster decode. |

```python
class ApiUser(Struct, rename="camel", kw_only=True):
    first_name: str
    last_name: str
    is_admin: bool = False

msgspec.json.encode(ApiUser(first_name="Ada", last_name="Lovelace"))
# b'{"firstName":"Ada","lastName":"Lovelace","isAdmin":false}'
```

`msgspec.field()` covers the cases where bare-default annotation isn't enough:

```python
class Run(Struct, kw_only=True):
    seed: int = field(default_factory=lambda: 42)
    user_agent: str = field(default="msgspec", name="userAgent")  # rename one field
```

For all class options, the `field()` signature, and `structs.*` helpers (`asdict`, `astuple`, `replace`, `fields`, `force_setattr`), load `references/structs_reference.md`.

## Encoding & decoding

### JSON

```python
# One-shot: convenient, fine for cold paths
buf = msgspec.json.encode(cfg)
cfg = msgspec.json.decode(buf, type=Config)

# Reusable: preferred in hot loops
enc = msgspec.json.Encoder()
dec = msgspec.json.Decoder(Config)

buf = enc.encode(cfg)
cfg = dec.decode(buf)
```

### MessagePack

```python
enc = msgspec.msgpack.Encoder()
dec = msgspec.msgpack.Decoder(Config)
buf = enc.encode(cfg)
cfg = dec.decode(buf)
```

### YAML / TOML

Require the `pyyaml` / `tomli_w` extras. Top-level API only (no Encoder/Decoder class).

```python
msgspec.yaml.encode(cfg)
msgspec.toml.decode(buf, type=Config)
```

### Custom types via hooks

Convert non-builtin types at the boundary with `enc_hook` / `dec_hook`:

```python
import pathlib

def enc_hook(obj):
    if isinstance(obj, pathlib.Path):
        return str(obj)
    raise NotImplementedError(type(obj))

def dec_hook(tp, obj):
    if tp is pathlib.Path:
        return pathlib.Path(obj)
    raise NotImplementedError(tp)

enc = msgspec.json.Encoder(enc_hook=enc_hook)
dec = msgspec.json.Decoder(MyConfig, dec_hook=dec_hook)
```

For full encoder/decoder signatures, streaming (NDJSON, `encode_into`, `decode_lines`), msgpack `Ext` types, and format-specific quirks, load `references/encoding.md`.

## Validation & constraints

Attach constraints to types with `msgspec.Meta`, wrapped in `Annotated`:

```python
from typing import Annotated
from msgspec import Meta

PositiveInt = Annotated[int, Meta(gt=0)]
ShortStr   = Annotated[str, Meta(min_length=1, max_length=64)]
UnixName   = Annotated[str, Meta(pattern="^[a-z_][a-z0-9_-]*$")]

class Resource(Struct):
    name: UnixName
    replicas: Annotated[int, Meta(ge=1, le=100)] = 1
    tags: Annotated[list[str], Meta(max_length=10)] = []
```

`Meta` supports `gt`/`ge`/`lt`/`le`/`multiple_of` (numeric), `pattern` (regex), `min_length`/`max_length` (any sized type), `tz` (datetime tz-awareness), plus `title`/`description`/`examples`/`extra_json_schema` for documentation that flows through to generated JSON Schema.

Validation errors:

```python
try:
    msgspec.json.decode(buf, type=Resource)
except msgspec.ValidationError as exc:
    print(exc)  # e.g. "Expected `int` >= 1 - at `$.replicas`"
```

For the full Meta parameter list, error-handling patterns, `convert` / `to_builtins`, `forbid_unknown_fields`, and validation via `__post_init__`, load `references/validation.md`.

## Tagged unions (polymorphic decoding)

A `Union` of `Struct` types is decoded by inspecting a discriminator field:

```python
from typing import Union

class Circle(Struct, tag=True):
    radius: float

class Rect(Struct, tag=True):
    w: float
    h: float

dec = msgspec.json.Decoder(Union[Circle, Rect])
dec.decode(b'{"type":"Circle","radius":3.0}')      # Circle(radius=3.0)
dec.decode(b'{"type":"Rect","w":2,"h":1}')         # Rect(w=2.0, h=1.0)
```

- `tag=True` → tag value is the class name. Use `tag="literal"` or `tag=str.lower` to customize.
- The discriminator field defaults to `"type"`; override with `tag_field="kind"`.

For full tagged-union patterns, `msgspec.Raw` (deferred decoding), `UNSET` (distinguish missing vs null), generic Structs, schema-evolution rules, and JSON Schema generation, load `references/advanced.md`.

## Performance tips

1. **Reuse `Encoder` / `Decoder` instances** — they cache internal state. The function-form allocates per call.
2. **`array_like=True`** trades JSON-object-ness for ~2x decode speed. Fields become positional, ordering becomes a wire-format contract.
3. **`omit_defaults=True`** shrinks payloads and speeds up encoding when defaults are common.
4. **`gc=False`** removes the Struct from cyclic-GC tracking — safe only when instances cannot participate in reference cycles.
5. **Narrow "view" Structs** — when decoding large messages but only reading a few fields, define a Struct with only those fields. msgspec efficiently skips unknown keys.
6. **`encode_into(obj, buffer)`** writes into a reusable `bytearray` — good for socket send loops.

```python
class CompactPoint(Struct, array_like=True, gc=False, frozen=True, cache_hash=True):
    x: float
    y: float

msgspec.json.encode(CompactPoint(1.0, 2.0))    # b'[1.0,2.0]'
```

For performance benchmarks, hot-path patterns, common pitfalls, and a comparison with dataclasses / pydantic / attrs, load `references/best_practices.md`.

## Cheatsheet

| Want | Use |
|---|---|
| Define a config or payload | `class C(Struct, kw_only=True): ...` |
| Mutable default (list, dict) | `field(default_factory=list)` or empty literal `[]` |
| JSON round-trip, one-shot | `msgspec.json.encode(obj)` / `msgspec.json.decode(buf, type=T)` |
| JSON round-trip, hot loop | `enc = json.Encoder(); dec = json.Decoder(T)` — reuse |
| MessagePack | `msgspec.msgpack.{Encoder, Decoder}` |
| YAML / TOML | `msgspec.yaml.{encode, decode}` / `msgspec.toml.{encode, decode}` |
| Polymorphic deserialization | `tag=True` on each Struct + `Decoder(Union[A, B])` |
| camelCase JSON keys | `Struct(..., rename="camel")` |
| Validate a dict you already have | `msgspec.convert(d, type=T)` |
| Struct → plain dict | `msgspec.structs.asdict(s)` (shallow) or `msgspec.to_builtins(s)` |
| Non-destructive copy with overrides | `msgspec.structs.replace(s, field=val)` |
| Distinguish missing vs null | `field: T \| None \| UnsetType = UNSET` |
| Forward raw bytes unmodified | `msgspec.Raw(b"...")` as a field value |
| Generate JSON Schema | `msgspec.json.schema(T)` |
| Custom type (e.g. Path) | `enc_hook` + `dec_hook` on `Encoder` / `Decoder` |
| Numeric / string constraints | `Annotated[int, Meta(gt=0, le=100)]` |

## When editing msgspec code

- After adding a field to a deployed Struct, give it a default. Old encoded messages would otherwise fail to decode.
- Prefer `kw_only=True` for any Struct that might gain fields later — sidesteps default ordering churn.
- `asdict` is shallow — nested Structs stay as Structs. Use `to_builtins` for fully-plain dicts (e.g. logging, `json.dumps`).
- `enc_hook` / `dec_hook` must `raise NotImplementedError` (not return `None`) for unsupported types.
- `tag_field` defaults to `"type"`. Pick a non-conflicting name if the schema uses `type` as a real field.
- `UNSET` is falsy — use `is UNSET`, not `== UNSET`.
- Struct construction does not validate types. Use `msgspec.convert` to validate untrusted Python data.

## References

This skill ships with thematic reference files. Load them on demand.

### references/

- `core_concepts.md` — Struct semantics, supported type system, validation model, comparison with dataclasses / pydantic / attrs.
- `structs_reference.md` — Full `Struct` class kwarg table, `msgspec.field()`, `msgspec.structs.*` helpers, default-handling rules, gotchas.
- `encoding.md` — JSON / MessagePack / YAML / TOML codecs, `Encoder` / `Decoder` classes, `enc_hook` / `dec_hook`, streaming, NDJSON, msgpack `Ext`.
- `validation.md` — `Meta` constraints in depth, `ValidationError`, `convert` / `to_builtins`, `forbid_unknown_fields`, `__post_init__` validation.
- `advanced.md` — Tagged unions, `msgspec.Raw`, `UNSET`, generic Structs, schema evolution, JSON Schema / OpenAPI generation.
- `best_practices.md` — Performance tips, hot-path patterns, anti-patterns, when not to use msgspec.
