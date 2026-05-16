# `tyro.conf` Markers

Full marker surface, grouped by purpose, plus the functional helpers `tyro.conf.arg`, `subcommand`, `configure`, `create_mutex_group`, and custom constructors via `tyro.constructors`.

## How markers attach

Three ways:

1. **Subscript directly**: `tyro.conf.Positional[str]` — equivalent to `Annotated[str, tyro.conf.Positional]`.
2. **Inside `Annotated`**: `Annotated[str, tyro.conf.Positional]` — recommended for readability.
3. **Globally on `tyro.cli`**: `tyro.cli(Args, config=(tyro.conf.OmitArgPrefixes,))` — applies to the whole tree.

Markers cascade to all children of the annotated field and **cannot be un-applied** in a subtree. Apply them at the narrowest sensible scope.

## Markers by purpose

### Visibility

| Marker | Purpose |
|---|---|
| `Suppress[T]` | Hide the field entirely from CLI and helptext. |
| `Fixed[T]` | Keep the default; no CLI flag created. Still shown in help. |
| `SuppressFixed` | Global: also hide all `Fixed` fields from helptext. |

```python
@dataclass
class Args:
    lr: float = 1e-3
    # Shown in help, no flag created:
    derived: Annotated[float, tyro.conf.Fixed] = 0.0
    # Completely hidden:
    internal: Annotated[str, tyro.conf.Suppress] = "secret"
```

### Positional arguments

| Marker | Purpose |
|---|---|
| `Positional[T]` | Field becomes a positional argument (no `--flag`). |
| `PositionalRequiredArgs` | Global: every field without a default becomes positional. |

```python
@dataclass
class Args:
    input_path: Annotated[str, tyro.conf.Positional]
    output_path: Annotated[str, tyro.conf.Positional]
    verbose: bool = False

# python script.py in.txt out.txt --verbose
```

Global form — all required fields positional in one shot:

```python
tyro.cli(Args, config=(tyro.conf.PositionalRequiredArgs,))
```

### Boolean flag shaping

| Marker | Purpose |
|---|---|
| `FlagConversionOff[bool]` | Disable `--flag` / `--no-flag` pair — require literal `True` / `False`. |
| `FlagCreatePairsOff[bool]` | Generate only one side of the bool pair (based on default). |

```python
@dataclass
class Args:
    fast: bool = False                                              # --fast / --no-fast
    debug: Annotated[bool, tyro.conf.FlagConversionOff] = False     # --debug True
    quiet: Annotated[bool, tyro.conf.FlagCreatePairsOff] = False    # --quiet only
```

### Naming

| Marker | Purpose |
|---|---|
| `OmitArgPrefixes` | Strip nested-field prefixes throughout the annotated subtree. |
| `OmitSubcommandPrefixes` | Strip the parent field name from subcommand identifiers. |

```python
# Whole tree:
tyro.cli(Args, config=(tyro.conf.OmitArgPrefixes,))
# All nested flags lose their dot-prefixes — name collisions become your problem.

# Single subtree:
class Args(Struct):
    optim: Annotated[OptimArgs, tyro.conf.OmitArgPrefixes]
```

`tyro.conf.arg(name="")` (see below) is a finer-grained alternative for flattening one level.

### Collections

| Marker | Purpose |
|---|---|
| `UseAppendAction[list[T]]` | Repeat the flag once per item instead of space-separated. |
| `UseCounterAction[int]` | Increment counter per occurrence (`-v -v -v` → 3). |
| `UsePythonSyntaxForLiteralCollections` | Accept `"[1,2,3]"` / `"{'a':1}"` Python-literal strings for collections. Useful for sweep tools (e.g. wandb). |

```python
@dataclass
class Args:
    tags: list[str] = field(default_factory=list)
    # Space-separated:  --tags red green blue

    rules: Annotated[
        list[tuple[float, int, float]],
        tyro.conf.UseAppendAction,
    ] = field(default_factory=list)
    # Repeated:  --rules 0.5 64 0.25 --rules 0.75 88 0.75

    verbose: Annotated[int, tyro.conf.UseCounterAction] = 0
    # -v → 1, -vvv → 3
```

### Enums

| Marker | Purpose |
|---|---|
| `EnumChoicesFromValues` | Use enum *values* as CLI choices instead of member names. |

```python
class Backend(Enum):
    CUDA = "cuda"
    ROCM = "rocm"

# Default: --backend {CUDA,ROCM}
# With marker:
backend: Annotated[Backend, tyro.conf.EnumChoicesFromValues] = Backend.CUDA
# --backend {cuda,rocm}
```

### Subcommand shaping

| Marker | Purpose |
|---|---|
| `AvoidSubcommands` | For Union fields with a default: skip subcommand UI, use the default directly. |
| `CascadeSubcommandArgs` | Allow shared args to cascade across nested subcommands. (Formerly `ConsolidateSubcommandArgs`, kept as alias.) |
| `NewSubcommandForDefaults` | Add an explicit `field:default` subcommand entry. |
| `ConsolidateSubcommandArgs` | Alias of `CascadeSubcommandArgs` (deprecated name). |

See `subcommands.md` for usage.

### None / Optional

| Marker | Purpose |
|---|---|
| `DisallowNone` | For `T \| None` fields: forbid passing `None` from CLI (default may still be `None`). |

```python
checkpoint: Annotated[Path | None, tyro.conf.DisallowNone] = None
# --checkpoint /path/to.pt   OK
# --checkpoint None          ERROR
```

### Helptext

| Marker | Purpose |
|---|---|
| `HelptextFromCommentsOff` | Global: don't derive helptext from inline / preceding comments. |

```python
tyro.cli(Args, config=(tyro.conf.HelptextFromCommentsOff,))
```

Use when comments are noisy or when only docstrings should drive helptext.

## Functional helpers

### `tyro.conf.arg`

```python
tyro.conf.arg(
    *,
    name: str | None = None,              # rename the flag; "" strips this field's prefix
    metavar: str | None = None,
    help: str | None = None,              # override helptext
    help_behavior_hint: str | None = None,
    aliases: tuple[str, ...] | None = None,    # extra flag names, e.g. ("--alt", "-a")
    prefix_name: bool = True,             # False = don't prefix children with this field's name
    constructor: Callable | None = None,
    constructor_factory: Callable | None = None,
    default: Any = MISSING_NONPROP,
)
```

Use: `Annotated[T, tyro.conf.arg(...)]`.

#### Common uses

```python
# Rename a flag
host: Annotated[str, tyro.conf.arg(name="server-host")] = "localhost"
# --server-host  (instead of --host)

# Add short alias
output: Annotated[Path, tyro.conf.arg(aliases=("-o",))]
# --output / -o

# Strip a top-level prefix (one level only)
Args = Annotated[_Args, tyro.conf.arg(name="")]
# --lr instead of --args.lr

# Override helptext
lr: Annotated[float, tyro.conf.arg(help="Learning rate (Adam default 1e-3)")] = 1e-3

# Custom constructor for an irregular type
def construct_array(values: tuple[float, ...], dtype: Literal["float32", "float64"] = "float32"):
    return np.array(values, dtype={"float32": np.float32, "float64": np.float64}[dtype])

array: Annotated[np.ndarray, tyro.conf.arg(constructor=construct_array)]
# CLI: --array.values 1 2 3 --array.dtype float32
```

The `constructor=` parameter is the simplest way to add CLI support for a type tyro doesn't understand natively. See "Custom constructors" below.

### `tyro.conf.subcommand`

```python
tyro.conf.subcommand(
    name: str | None = None,
    *,
    default: Any = MISSING_NONPROP,
    description: str | None = None,
    prefix_name: bool = True,
    constructor: Callable | None = None,
    constructor_factory: Callable | None = None,
)
```

Use: `Annotated[Variant, tyro.conf.subcommand("name")]` inside a Union. See `subcommands.md`.

### `tyro.conf.configure`

Decorator that attaches markers to a function or class:

```python
@tyro.conf.configure(tyro.conf.FlagConversionOff)
def train(verbose: bool, lr: float) -> None: ...

tyro.cli(train)
# --verbose True (no auto-pairing)
```

Equivalent to passing markers via `config=(...)` to `tyro.cli`, but the marker travels with the callable.

### `tyro.conf.create_mutex_group`

Build a marker token that, when applied to multiple fields, makes them mutually exclusive — at most one (or exactly one if `required=True`) may be provided.

```python
import tyro
from typing import Annotated, Literal
from pathlib import Path

OutputGroup = tyro.conf.create_mutex_group(required=True, title="output target")
VerbosityGroup = tyro.conf.create_mutex_group(required=False, title="verbosity")

def main(
    target_stream: Annotated[Literal["stdout", "stderr"] | None, OutputGroup] = None,
    target_file:   Annotated[Path | None,                       OutputGroup] = None,
    verbose:       Annotated[bool, VerbosityGroup] = False,
    very_verbose:  Annotated[bool, VerbosityGroup] = False,
) -> None: ...

tyro.cli(main, config=(tyro.conf.DisallowNone, tyro.conf.FlagCreatePairsOff))
```

Behavior:

- `required=True` — user must provide exactly one. Otherwise tyro errors.
- `required=False` (default) — at most one. Zero is allowed.
- The `title` is shown as the group heading in `--help`.
- Combine with `DisallowNone` to keep `--target-stream None` out of the choices, and `FlagCreatePairsOff` to suppress `--no-verbose` etc.

## Custom constructors

### Per-field constructor via `arg(constructor=...)`

```python
import numpy as np
from typing import Annotated, Literal
import tyro

def construct_array(
    values: tuple[float, ...],
    dtype: Literal["float32", "float64"] = "float64",
) -> np.ndarray:
    """A custom constructor for 1D NumPy arrays."""
    return np.array(
        values,
        dtype={"float32": np.float32, "float64": np.float64}[dtype],
    )

def main(
    array: Annotated[np.ndarray, tyro.conf.arg(constructor=construct_array)],
) -> None:
    print(f"{array=}")

tyro.cli(main)
# CLI exposes:  --array.values FLOAT [FLOAT ...] --array.dtype {float32,float64}
```

The constructor's signature is introspected — its args become CLI flags under the field path.

### Type-wide constructor via `tyro.constructors`

For a type used in many places, register a constructor once:

```python
import json
from typing import Annotated
import tyro

JsonDict = Annotated[
    dict,
    tyro.constructors.PrimitiveConstructorSpec(
        nargs=1,                                              # arity on CLI
        metavar="JSON",
        instance_from_str=lambda args: json.loads(args[0]),  # parse
        is_instance=lambda x: isinstance(x, dict),           # helptext / unions
        str_from_instance=lambda x: [json.dumps(x)],         # encode defaults back
    ),
]

def main(
    dict1: JsonDict,
    dict2: JsonDict = {"default": None},
) -> None: ...

tyro.cli(main)
# CLI:  --dict1 '{"key":"value"}'  --dict2 '{"k":"v"}'
```

`PrimitiveConstructorSpec` covers types parsed from a small fixed number of CLI tokens (`nargs=1` for a single JSON string, `nargs=2` for a `(int, int)` pair, etc.).

For complex types with nested sub-fields, use the per-field `arg(constructor=...)` form instead — it can leverage struct-like subfield introspection automatically.

### Constructor registry

For library code that ships custom types, the constructor registry pattern keeps the registration scoped:

```python
registry = tyro.constructors.ConstructorRegistry()

@registry.primitive_rule
def my_type_rule(type_info):
    if type_info.type is MyCustomType:
        return tyro.constructors.PrimitiveConstructorSpec(...)
    return None

with registry:
    args = tyro.cli(Args)
```

See `examples/06_custom_constructors/` in the tyro repo for full registry-based patterns.

## Marker precedence and cascading

- A marker applied to a field cascades to all its children (sub-fields, sub-flags).
- Cannot be un-applied in a subtree. To exempt a child, restructure or split the type.
- Global markers (via `config=` to `tyro.cli`) apply to the entire tree.
- Field-level markers override global markers for that subtree.

```python
# Global: omit all prefixes
tyro.cli(Args, config=(tyro.conf.OmitArgPrefixes,))

# Field-level: keeping the prefix for a specific subtree is not directly possible.
# Restructure or split if you need a mix.
```

## Worked example — combining markers

```python
from dataclasses import dataclass, field
from pathlib import Path
from typing import Annotated, Literal
import tyro

OutputGroup = tyro.conf.create_mutex_group(required=True, title="output target")

@dataclass
class Args:
    """A CLI demonstrating several markers."""

    input_path: Annotated[Path, tyro.conf.Positional]
    """Input file."""

    target_stream: Annotated[
        Literal["stdout", "stderr"] | None, OutputGroup
    ] = None
    target_file: Annotated[Path | None, OutputGroup] = None

    verbose: Annotated[int, tyro.conf.UseCounterAction] = 0
    """Verbosity (-v, -vv, -vvv)."""

    debug: Annotated[bool, tyro.conf.FlagCreatePairsOff] = False
    """Enable debug mode (no --no-debug)."""

    overrides: Annotated[
        list[str], tyro.conf.UseAppendAction
    ] = field(default_factory=list)
    """Repeatable --overrides=key=value flag."""

tyro.cli(
    Args,
    config=(tyro.conf.DisallowNone,),
)
```

## Common pitfalls

- **Combining `OmitArgPrefixes` with named subcommands**: name collisions become silent and break parsing. Check `--help` after applying.
- **Markers in nested `Annotated`**: `Annotated[Annotated[T, A], B]` is equivalent to `Annotated[T, A, B]` — both markers apply.
- **`tyro.conf.arg(name="")` for flattening**: only flattens one level. For deeper flattening, use `OmitArgPrefixes` on the subtree (and accept that it strips everywhere below).
- **Custom constructor functions must have full type annotations** — tyro introspects the signature to build the CLI flags. Untyped params are treated as `str`.
- **`prefix_name=False`** on `arg(...)` only stops *children* of the annotated field from inheriting the field-name prefix — it doesn't rename the field itself. Use `name=""` for that.
