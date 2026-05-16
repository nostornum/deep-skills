---
name: tyro
description: Generate typed Python CLIs directly from type hints. Use when adding command-line flags, subcommands, or config classes — tyro turns dataclasses, msgspec.Struct, pydantic.BaseModel, attrs classes, NamedTuples, TypedDicts, or plain functions into a parser with helptext from docstrings, auto `--flag` / `--no-flag` pairs, dot-paths for nested configs, and subcommands for unions.
license: MIT
metadata:
  version: "1.0"
  upstream: https://github.com/brentyi/tyro
---

# tyro

## Overview

tyro generates argparse-style CLIs from type hints. One call — `tyro.cli(Config)` — turns a typed config object into a parser with helptext from docstrings, `--flag`/`--no-flag` pairs for booleans, dot-paths for nested configs, and subcommands for `Union` types. It supports dataclasses, `msgspec.Struct`, `pydantic.BaseModel`, attrs classes, `NamedTuple`, `TypedDict`, and plain functions — pick whatever style your code already uses.

## Quick start

Install:

```
uv pip install tyro
```

Single config, single entry point:

```python
from dataclasses import dataclass
import tyro

@dataclass
class Args:
    """Greet someone."""
    name: str
    """Who to greet."""
    loud: bool = False
    """Shout the greeting."""

def main(args: Args) -> None:
    msg = f"Hello, {args.name}!"
    print(msg.upper() if args.loud else msg)

if __name__ == "__main__":
    main(tyro.cli(Args))
```

```
$ python script.py --name world           # Hello, world!
$ python script.py --name world --loud    # HELLO, WORLD!
$ python script.py --name world --no-loud # Hello, world!
$ python script.py --help
```

## Mental model

- Each field of the config class becomes `--field-name`. Nested classes become `--parent.child.field`. `_` and `-` are interchangeable when parsing.
- Fields without a default are required.
- Booleans with a default auto-pair into `--flag` / `--no-flag`.
- A `Union` of config classes becomes subcommands, selected on the CLI as `<field-path>:<variant-name>`.
- Helptext is harvested from class docstrings, attribute docstrings (string literal directly under a field), preceding/inline comments, and Google/NumPy/ReST `Args:` blocks.
- `tyro.conf.X` markers customize per-field behavior via `Annotated[T, tyro.conf.X]`.

For helptext-source precedence and validation details, load `references/core_concepts.md`.

## Config object types

tyro accepts almost any structured Python type. Match what's already in the surrounding code:

```python
# dataclass
@dataclass
class Args: ...

# msgspec
from msgspec import Struct
class Args(Struct, kw_only=True): ...

# pydantic
from pydantic import BaseModel
class Args(BaseModel): ...

# plain function (args become flags)
def main(name: str, loud: bool = False) -> None: ...
tyro.cli(main)
```

Supported field types include `bool`, `int`, `float`, `str`, `pathlib.Path`, `list[T]`, `tuple[A, B]`, `tuple[T, ...]`, `set[T]`, `dict[K, V]`, `Literal[...]`, `Enum`, `datetime.*`, `T | None`, and `Union` of structs (becomes subcommands).

For the full type-support cheatsheet, supported config object types, generics, and mixing required/optional fields, load `references/config_types.md`.

## Entry points

| Situation | Use |
|---|---|
| One config, one program | `tyro.cli(Config)` |
| Multiple subcommands dispatched by name (git-style) | `tyro.extras.subcommand_cli_from_dict({...})` |
| Named base configs the user picks between, then overrides | `tyro.extras.overridable_config_cli({...})` |
| Decorator-style subcommands (click-like) | `tyro.extras.SubcommandApp()` + `@app.command` |
| Programmatic parser (for completion, tests) | `tyro.extras.get_parser(Config)` |

```python
# Git-style multi-subcommand CLI
def _main() -> None:
    tyro.extras.subcommand_cli_from_dict({
        "train":   train.main,
        "eval":    eval_.main,
        "prepare": prepare.main,
    })

# Pick from named bases, then tweak
config = tyro.extras.overridable_config_cli({
    "small": ("Quick sanity check.", ExperimentConfig(lr=3e-4, batch_size=8)),
    "big":   ("Full training run.", ExperimentConfig(lr=1e-4, batch_size=256)),
})
```

For the full `tyro.cli` signature, all `tyro.extras` helpers, and a decision tree for picking an entry point, load `references/entry_points.md`.

## Subcommands (unions of structs)

A `Union` of config types becomes a subcommand:

```python
from typing import Annotated
import tyro
from msgspec import Struct, field

class Uniform(Struct):
    """Sample time uniformly in [0, 1]."""

class LogitNormal(Struct, kw_only=True):
    """Sample time from a logit-normal distribution."""
    mean: float = 0.0
    std: float = 1.0

TimeArgs = (
    Annotated[Uniform,     tyro.conf.subcommand("uniform")]
    | Annotated[LogitNormal, tyro.conf.subcommand("logit-normal")]
)

class TrainArgs(Struct, kw_only=True):
    time: TimeArgs = field(default_factory=Uniform)
```

```
$ python script.py                                      # Uniform default
$ python script.py time:logit-normal                    # pick variant
$ python script.py time:logit-normal --time.mean 0.5    # configure variant
```

- Selection syntax: `<field-path>:<variant-name>`
- Variant name = class name in kebab-case, or whatever `tyro.conf.subcommand("name")` declares.

For nested subcommands, default variants, cascade flags, and selection syntax in depth, load `references/subcommands.md`.

## `tyro.conf` markers

Reach for `Annotated[T, tyro.conf.X]` only when default behavior doesn't fit. Most fields need no markers.

| Marker | Purpose |
|---|---|
| `Positional[T]` | Field becomes a positional argument. |
| `Fixed[T]` | Keep the default; no CLI flag created. |
| `Suppress[T]` | Hide from CLI and helptext. |
| `FlagConversionOff[bool]` | Always require `True`/`False` literal. |
| `FlagCreatePairsOff[bool]` | Generate only one side of the bool pair. |
| `UseAppendAction[list[T]]` | Repeat the flag per item instead of space-separated. |
| `UseCounterAction[int]` | `-v -v -v` → 3. |
| `EnumChoicesFromValues` | Use enum *values* as choices instead of member names. |
| `OmitArgPrefixes` | Strip nested-field prefixes throughout a subtree. |

Functional helpers:

```python
tyro.conf.arg(name="", help="...", aliases=("-a",))   # rename / alias a flag
tyro.conf.subcommand("variant-name")                  # name a Union variant
tyro.conf.configure(*markers)                         # decorator form
tyro.conf.create_mutex_group(required=True)           # mutex groups
```

For the full marker table grouped by purpose, custom constructors, and full signatures, load `references/markers.md`.

## Common patterns

Repeatable list flag:

```python
rules: Annotated[list[tuple[float, int, float]], tyro.conf.UseAppendAction] = ...
# --rules 0.5 64 0.25 --rules 0.75 88 0.75
```

Strip a top-level prefix:

```python
TrainArgs = Annotated[_TrainArgs, tyro.conf.arg(name="")]  # --lr, not --train.lr
```

Override defaults at the call site:

```python
args = tyro.cli(
    TrainArgs,
    default=TrainArgs(lr=1e-3, run_name=tyro.MISSING),    # MISSING → required
)
```

Positional args:

```python
@dataclass
class Args:
    input_path: Annotated[str, tyro.conf.Positional]
    output_path: Annotated[str, tyro.conf.Positional]
    verbose: bool = False
# python script.py in.txt out.txt --verbose
```

Boolean variations:

```python
fast: bool = False                                      # --fast / --no-fast pair
debug: Annotated[bool, tyro.conf.FlagConversionOff] = False   # --debug True
quiet: Annotated[bool, tyro.conf.FlagCreatePairsOff] = False  # only --quiet
```

## Default workflow when editing CLI code

1. **Pick an entry-point shape** (single config / git-style subcommands / overridable bases). See `references/entry_points.md`.
2. **Match the surrounding code's config style.** dataclass / `msgspec.Struct` / `pydantic.BaseModel`. Don't introduce a new framework.
3. **Define fields with type hints, defaults, and attribute docstrings** for help.
4. **Reach for `Annotated[T, tyro.conf.X]` only when default behavior doesn't fit.** Most fields need no markers.
5. **Run with `--help` once** to verify the resulting surface.

## When editing tyro code

- Keep field names short and descriptive — they become the user-facing flag.
- Prefer attribute docstrings (`"""Learning rate."""` directly under a field) for helptext — they're the cleanest source.
- Reach for `kw_only=True` if you hit "default before non-default" ordering errors (msgspec/dataclass).
- Don't combine `OmitArgPrefixes` with named subcommands unless you've verified the resulting names are unique.
- Don't introduce YAML/JSON config loading unless the codebase already uses it — `tyro.cli(..., default=Args(...))` is usually enough.
- For UI/CLI changes, run `script.py --help` and verify the surface before reporting done.

## Cheatsheet

| Want | Use |
|---|---|
| Required field | `name: str` (no default) |
| Optional with default | `lr: float = 1e-3` |
| Required despite class-level default | `default=Args(field=tyro.MISSING)` at call site |
| Nested config | Plain field of a struct type → `--parent.child` |
| Choice from a fixed set | `mode: Literal["a", "b", "c"]` |
| Flag pair | `bool = False` → `--flag` / `--no-flag` |
| Repeated flag | `Annotated[list[T], tyro.conf.UseAppendAction]` |
| Counter flag | `Annotated[int, tyro.conf.UseCounterAction] = 0` (`-vvv`) |
| Subcommand union | `Annotated[A, subcommand("a")] \| Annotated[B, subcommand("b")]` |
| Strip top-level prefix | `Annotated[Cfg, tyro.conf.arg(name="")]` |
| Hide a field | `Annotated[T, tyro.conf.Suppress]` |
| Mutex group | `tyro.conf.create_mutex_group(required=True)` |
| Parse from list (tests) | `tyro.cli(Args, args=["--lr", "1e-3"])` |
| Silence on non-rank-0 | `tyro.cli(Args, console_outputs=(rank == 0))` |
| Verbosity (`-v`/`-q`) | `tyro.extras.Verbosity` |

## References

This skill ships with thematic reference files. Load them on demand.

### references/

- `core_concepts.md` — mental model, naming/parsing rules, bool flag pairing, helptext-source precedence, validation, error reporting.
- `config_types.md` — supported config object types (dataclass, msgspec, pydantic, attrs, NamedTuple, TypedDict, functions, generics), full type-support cheatsheet, mixing required/optional fields.
- `entry_points.md` — full `tyro.cli` signature, `tyro.extras.*` helpers (`subcommand_cli_from_dict`, `overridable_config_cli`, `SubcommandApp`, `subcommand_type_from_defaults`, `literal_type_from_choices`, `Verbosity`, `get_parser`), decision tree.
- `subcommands.md` — Union → subcommands, selection syntax, `tyro.conf.subcommand`, nested subcommands, default variants, `CascadeSubcommandArgs`, `AvoidSubcommands`.
- `markers.md` — full `tyro.conf` marker table grouped by purpose, `tyro.conf.arg` / `subcommand` / `configure` / `create_mutex_group` signatures, custom constructors via `arg(constructor=...)` and `tyro.constructors`.
- `best_practices.md` — gotchas, testing patterns, distributed silencing, `compact_help`, `Verbosity`, common errors, anti-patterns, comparison with click/argparse/fire.
