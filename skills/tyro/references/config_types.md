# Config Object Types

Every type tyro accepts as a config — dataclasses, msgspec, pydantic, attrs, NamedTuple, TypedDict, functions, generics — plus the full per-type CLI behavior cheatsheet.

## Supported config object types

| Type | Notes |
|---|---|
| `@dataclass` | Canonical. Use `field(default_factory=...)` for mutables. |
| `msgspec.Struct` | Full support. Use `kw_only=True` to relax field ordering. `Field(description=...)` becomes helptext. |
| `pydantic.BaseModel` | Full support. `Field(description=...)` becomes helptext. |
| `attrs.define` / `@attr.s` | Use `attr.ib(factory=...)` for mutable defaults. |
| `typing.NamedTuple` | Fields without defaults are required. |
| `typing.TypedDict` | Supports `total=False`, `Required`, `NotRequired`. |
| Plain functions | Args become flags; docstring becomes the CLI description. |
| `Union[A, B, ...]` of any of the above | Becomes subcommands (see `subcommands.md`). |
| Generic parameterizations | `tyro.cli(MyGeneric[ConcreteType])` resolves TypeVars at parse time. |

### dataclass

```python
from dataclasses import dataclass, field
import tyro

@dataclass
class TrainArgs:
    """Train a model."""
    seed: int = 42
    tags: list[str] = field(default_factory=list)
    epochs: int = 10

tyro.cli(TrainArgs)
```

### msgspec.Struct

```python
from msgspec import Struct, field
import tyro

class TrainArgs(Struct, kw_only=True):
    """Train a model."""
    seed: int = 42
    epochs: int = 10
    tags: list[str] = field(default_factory=list)

tyro.cli(TrainArgs)
```

`kw_only=True` is recommended — sidesteps default ordering issues when fields are added later.

### pydantic.BaseModel

```python
from pydantic import BaseModel, Field
import tyro

class TrainArgs(BaseModel):
    """Train a model."""
    seed: int = 42
    lr: float = Field(default=1e-4, description="Learning rate")

tyro.cli(TrainArgs)
```

`Field(description=...)` flows through as helptext.

### attrs

```python
import attrs
import tyro

@attrs.define
class TrainArgs:
    """Train a model."""
    seed: int = 42
    tags: list[str] = attrs.field(factory=list)

tyro.cli(TrainArgs)
```

### NamedTuple

```python
from typing import NamedTuple
import tyro

class Args(NamedTuple):
    name: str            # required
    epochs: int = 10     # optional

tyro.cli(Args)
```

### TypedDict

```python
from typing import TypedDict, NotRequired
import tyro

class Args(TypedDict):
    name: str
    epochs: NotRequired[int]

tyro.cli(Args)
```

For `total=False`, all keys become optional. `Required[T]` / `NotRequired[T]` (PEP 655) override per-key.

### Plain functions

```python
import tyro

def main(name: str, loud: bool = False) -> None:
    """Greet someone.

    Args:
        name: Who to greet.
        loud: Shout the greeting.
    """
    print(f"{'HELLO' if loud else 'Hello'}, {name}!")

tyro.cli(main)
```

When the entry point is a function, `tyro.cli` calls it and returns the result. The function's docstring (Google/NumPy/ReST `Args:` block) supplies per-arg helptext. **Note**: `default=` is not supported for plain functions — put defaults in the signature.

### Generics

```python
from typing import Generic, TypeVar
from dataclasses import dataclass
import tyro

T = TypeVar("T")

@dataclass
class Wrapper(Generic[T]):
    value: T

@dataclass
class Inner:
    x: int
    y: int

args = tyro.cli(Wrapper[Inner])
# --value.x INT, --value.y INT
```

Parametrize at the call site. Unparametrized `Wrapper` falls back to whatever bound/default the TypeVar declares (or `Any`).

## Mixing required and optional fields

`tyro.cli` accepts an `args=` parameter for parse-from-list testing:

```python
args = tyro.cli(TrainArgs, args=["--seed", "7", "--epochs", "5"])
```

For "default before non-default" ordering errors:

```python
# Errors at class creation
@dataclass
class Bad:
    lr: float = 1e-3
    name: str               # required after optional

# Fix 1: reorder (required first)
@dataclass
class Good1:
    name: str
    lr: float = 1e-3

# Fix 2: kw_only (preferred — order-independent)
@dataclass(kw_only=True)
class Good2:
    lr: float = 1e-3
    name: str

# msgspec equivalent
from msgspec import Struct
class Good3(Struct, kw_only=True):
    lr: float = 1e-3
    name: str
```

## Field type cheatsheet

| Python type | CLI behavior |
|---|---|
| `bool` (no default) | Requires explicit `--flag True` / `--flag False`. |
| `bool = False` | Auto-paired: `--flag` sets True, `--no-flag` sets False. |
| `Annotated[bool, FlagConversionOff]` | Always requires `True`/`False` literal. |
| `Annotated[bool, FlagCreatePairsOff]` | Only the non-default side is created. |
| `int` / `float` / `str` | Single value: `--flag 7`. |
| `pathlib.Path` (also `upath.UPath`) | String parsed and wrapped. |
| `list[T]` | Space-separated: `--flag a b c`. |
| `Annotated[list[T], UseAppendAction]` | Repeated flag: `--flag a --flag b`. |
| `tuple[A, B]` | Fixed arity, typed: `--flag 1 hello`. |
| `tuple[T, ...]` | Variable arity, space-separated. |
| `set[T]` | Like list, deduplicated. |
| `frozenset[T]` | Like set, immutable. |
| `dict[K, V]` (with default) | Each key becomes `--field.key value`. |
| `Literal["a", "b"]` | Choices validated at parse time. |
| `Enum` | Member names as choices by default; `EnumChoicesFromValues` to use values. |
| `T \| None` | Optional. Pass `--flag None` for None, omit for default. `DisallowNone` blocks the explicit None. |
| `Union[primitive_a, primitive_b]` | Each type attempted in order. |
| `Union[Struct1, Struct2]` | Becomes subcommands (see `subcommands.md`). |
| `datetime.date / datetime / time / timedelta` | Parsed from ISO-format strings. |

### Examples

```python
from dataclasses import dataclass
from enum import Enum
from typing import Literal
from pathlib import Path
import tyro

class Backend(Enum):
    CUDA = "cuda"
    ROCM = "rocm"
    CPU = "cpu"

@dataclass
class Args:
    # Scalars
    seed: int = 42
    lr: float = 1e-3
    name: str = "run"

    # Path
    output: Path = Path("./out")

    # Choices
    precision: Literal["fp16", "bf16", "fp32"] = "bf16"
    backend: Backend = Backend.CUDA

    # Collections
    tags: list[str] = field(default_factory=list)
    coords: tuple[int, int] = (0, 0)

    # Optional
    checkpoint: Path | None = None
```

```
--seed INT                              [default 42]
--lr FLOAT                              [default 0.001]
--name STR                              [default 'run']
--output PATH                           [default 'out']
--precision {fp16,bf16,fp32}            [default 'bf16']
--backend {CUDA,ROCM,CPU}               [default 'CUDA']
--tags STR [STR ...]                    [default []]
--coords INT INT                        [default (0, 0)]
--checkpoint PATH                       [default None]
```

## `dict[K, V]` parsing

Dicts are expanded into per-key flags when they have a default:

```python
@dataclass
class Args:
    overrides: dict[str, int] = field(default_factory=lambda: {"a": 1, "b": 2})

# CLI flags:
#   --overrides.a INT  [default 1]
#   --overrides.b INT  [default 2]
```

For a free-form dict (keys not known at definition time), use a string-key collection and a custom constructor, or pass JSON via `tyro.constructors.PrimitiveConstructorSpec` (see `markers.md`).

## Quirks and gotchas

- **`__post_init__` runs twice** when `default=` is provided to `tyro.cli` — once on the seed instance, once on the final parsed instance. Avoid mutation / side effects.
- **Variable-length `list[Dataclass]` cannot be extended from the CLI** — length is fixed by the default. `list[int]` and other primitives are unconstrained.
- **Self-referential types are not supported.**
- For static typing with `subcommand_type_from_defaults` / `literal_type_from_choices`, hide the runtime call behind `if TYPE_CHECKING:` (see `entry_points.md`).
- **`Union[A, B]` of structs type-checks poorly with mypy** — annotate the result explicitly or switch to pyright.

## Type aliases (Python 3.12+)

PEP 695 `type` aliases work:

```python
from dataclasses import dataclass
import tyro

type PositiveInt = int   # Constraint is for type-checkers; tyro treats as `int`

@dataclass
class Args:
    epochs: PositiveInt = 10
```

For runtime-validated constraints, wrap with `Annotated` and a custom constructor (see `markers.md`), or use a library like pydantic.
