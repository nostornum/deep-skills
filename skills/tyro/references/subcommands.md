# Subcommands

Union types as subcommands: selection syntax, named variants, nested subcommands, default variants, cascading args.

## The basic mapping

A `Union` of struct types becomes a subcommand on the CLI:

```python
from typing import Annotated
import tyro
from msgspec import Struct

class Uniform(Struct):
    """Sample time uniformly in [0, 1]."""

class LogitNormal(Struct, kw_only=True):
    """Sample time from a logit-normal distribution."""
    mean: float = 0.0
    std: float = 1.0

TimeArgs = Uniform | LogitNormal

class TrainArgs(Struct, kw_only=True):
    time: TimeArgs

tyro.cli(TrainArgs)
```

```
$ python script.py time:uniform
$ python script.py time:logit-normal --time.mean 0.5
```

## Selection syntax

```
<field-path>:<variant-name>
```

- Field path uses dot-nesting (`time`, `optim.scheduler`).
- Variant name follows the field path, separated by `:`.
- Default variant name = class name converted to kebab-case (`LogitNormal` → `logit-normal`).
- Override the variant name with `tyro.conf.subcommand("name")`.

For nested subcommand fields, paths chain:

```
$ python script.py mode:train time:logit-normal --time.mean 0.5
```

## Named variants — `tyro.conf.subcommand`

Wrap each Union member with `Annotated[..., tyro.conf.subcommand("name")]` to pin the variant name:

```python
from typing import Annotated
import tyro

TimeArgs = (
    Annotated[Uniform,     tyro.conf.subcommand("uniform")]
    | Annotated[LogitNormal, tyro.conf.subcommand("logit-normal")]
)
```

Full `subcommand()` signature:

```python
tyro.conf.subcommand(
    name: str | None = None,
    *,
    default: Any = MISSING_NONPROP,         # per-variant default
    description: str | None = None,         # override class docstring
    prefix_name: bool = True,               # include parent prefix in nested names
    constructor: Callable | None = None,
    constructor_factory: Callable | None = None,
)
```

`description=` overrides what shows up in the subcommand list. `prefix_name=False` disables the parent-field prefix in the subcommand name (see "Nested subcommands" below).

## Default subcommand variant

If the parent field has a default value, the matching variant is selected when no subcommand is given:

```python
from msgspec import Struct, field

class TrainArgs(Struct, kw_only=True):
    time: TimeArgs = field(default_factory=Uniform)

# python script.py                       → Uniform default (no subcommand needed)
# python script.py time:logit-normal     → switch variant
```

To add an explicit `time:default` entry that re-selects the default, use `tyro.conf.NewSubcommandForDefaults`:

```python
class TrainArgs(Struct, kw_only=True):
    time: Annotated[TimeArgs, tyro.conf.NewSubcommandForDefaults] = field(
        default_factory=Uniform
    )
```

## `AvoidSubcommands`

For Union fields with a default, you can skip the subcommand UI entirely and use the default — useful when the alternative variants are advanced and rarely needed:

```python
class TrainArgs(Struct, kw_only=True):
    time: Annotated[TimeArgs, tyro.conf.AvoidSubcommands] = field(
        default_factory=Uniform
    )

# CLI is now flat — only --time.* if Uniform exposes any flags.
# User cannot pick LogitNormal from the command line.
```

This is destination-driven: the default's type is used as the only variant. Use sparingly.

## Multiple subcommand fields — `CascadeSubcommandArgs`

When a config has multiple Union fields, by default each forms its own subcommand layer:

```
$ python script.py mode:train time:logit-normal --train.lr 1e-4 --time.mean 0.5
```

To allow shared args at the outer level to cascade through nested subcommands, apply `tyro.conf.CascadeSubcommandArgs`:

```python
class TrainArgs(Struct, kw_only=True):
    seed: int = 42
    mode: Annotated[ModeUnion, tyro.conf.CascadeSubcommandArgs]
    time: TimeArgs
```

Now `--seed` is accepted at any point in the subcommand chain, not only before `mode:`. (Formerly `ConsolidateSubcommandArgs`; the old name is retained as an alias.)

## Nested subcommands (grouping a Union)

By default, a `Union` of structs is flattened into the parent subcommand list. To create a named group, wrap the Union in `Annotated[..., tyro.conf.subcommand(name=...)]`:

```python
from typing import Annotated
import dataclasses
import tyro

@dataclasses.dataclass
class Checkout:
    """Checkout a branch."""
    branch: str

@dataclasses.dataclass
class Commit:
    """Commit changes."""
    message: str

@dataclasses.dataclass
class Push:
    remote: str = "origin"
    branch: str = "main"

@dataclasses.dataclass
class Pull:
    remote: str = "origin"

Remote = Annotated[
    Push | Pull,
    tyro.conf.subcommand(name="remote", description="Remote operations."),
]

cmd = tyro.cli(Checkout | Commit | Remote)
```

```
$ python script.py --help
# top-level subcommands: checkout, commit, remote

$ python script.py remote --help
# nested: push, pull

$ python script.py remote push --remote origin --branch main
$ python script.py remote pull --remote origin
```

This pattern produces a hierarchical CLI without needing `subcommand_cli_from_dict`.

## `OmitSubcommandPrefixes`

By default, subcommand names include their parent field's prefix in nested settings (e.g. `time:logit-normal`). Use `OmitSubcommandPrefixes` to strip the field-name prefix from subcommand IDs:

```python
class TrainArgs(Struct, kw_only=True):
    time: Annotated[TimeArgs, tyro.conf.OmitSubcommandPrefixes] = ...

# python script.py logit-normal              (instead of time:logit-normal)
```

Use carefully — name collisions across multiple Union fields are likely.

## Multiple subcommand layers

A typical multi-mode CLI:

```python
from typing import Annotated
import tyro
from msgspec import Struct, field

class TrainMode(Struct, kw_only=True):
    epochs: int = 10
    lr: float = 1e-3

class EvalMode(Struct, kw_only=True):
    checkpoint: str

Mode = (
    Annotated[TrainMode, tyro.conf.subcommand("train")]
    | Annotated[EvalMode, tyro.conf.subcommand("eval")]
)

class Args(Struct, kw_only=True):
    """Train or evaluate."""
    seed: int = 42
    mode: Mode

tyro.cli(Args)
```

```
$ python script.py mode:train --mode.lr 1e-4
$ python script.py mode:eval --mode.checkpoint runs/last.pt
$ python script.py --help
```

If you want true git-style top-level subcommands (`script.py train ...`), prefer `subcommand_cli_from_dict` or `SubcommandApp` — see `entry_points.md`.

## Subcommand selection rules

When tyro encounters a Union of struct types:

1. **All Union members must be struct-like** (dataclass, msgspec, etc.). Primitives in the same Union are not allowed alongside structs.
2. **Variant names must be unique** within their parent subcommand. Collisions raise at parse-time.
3. **Variant names default to class-name kebab-case**; override via `tyro.conf.subcommand("name")`.
4. **`tag_field` does not apply** — tyro uses subcommand positional dispatch, not msgspec's `tag=` discriminator. The two systems can coexist (msgspec's `tag` controls JSON serialization; tyro's subcommand syntax controls CLI dispatch).

## Constraints

- **All variants in a Union must be struct types** for subcommand dispatch. To mix a struct with `None`, use a default of `None` on the parent field (or `Optional[Struct]`).
- **Variant defaults**: each variant has its own defaults. The Union as a whole has at most one variant chosen as the default (the type matching the parent field's default).
- **Inheritance**: subclass relationships don't create implicit Union members. Build the Union explicitly.

## Worked example — discriminator across many variants

```python
from typing import Annotated
from msgspec import Struct, field
import tyro

class UniformTime(Struct, kw_only=True):
    """Sample time uniformly."""

class LogitNormalTime(Struct, kw_only=True):
    """Sample time from logit-normal."""
    mean: float = 0.0
    std: float = 1.0

class CosineTime(Struct, kw_only=True):
    """Sample from cosine schedule."""
    warmup: float = 0.0

TimeArgs = (
    Annotated[UniformTime,    tyro.conf.subcommand("uniform")]
    | Annotated[LogitNormalTime, tyro.conf.subcommand("logit-normal")]
    | Annotated[CosineTime,   tyro.conf.subcommand("cosine")]
)

class TrainArgs(Struct, kw_only=True):
    """Train a diffusion model."""
    seed: int = 42
    time: TimeArgs = field(default_factory=UniformTime)

args = tyro.cli(TrainArgs)
```

```
$ python script.py                                    # uniform default
$ python script.py time:logit-normal --time.mean 0.5
$ python script.py time:cosine --time.warmup 0.1
$ python script.py --help                             # lists all variants
```

Adding a new variant later: append `Annotated[NewVariant, tyro.conf.subcommand("new")]` to the Union. No changes needed elsewhere.
