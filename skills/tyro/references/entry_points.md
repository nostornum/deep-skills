# Entry Points

Every way to wire tyro into your program: `tyro.cli`, `tyro.extras.subcommand_cli_from_dict`, `tyro.extras.overridable_config_cli`, `tyro.extras.SubcommandApp`, plus helpers `subcommand_type_from_defaults`, `literal_type_from_choices`, `Verbosity`, and `get_parser`.

## Decision tree

```
Single program, one config class?
  └─ tyro.cli(Config)

Multiple top-level commands dispatched by name (git-style)?
  └─ tyro.extras.subcommand_cli_from_dict({...})
     or SubcommandApp + @app.command

User chooses among named base configs, then tweaks?
  └─ tyro.extras.overridable_config_cli({"name": (desc, instance), ...})

One field with several mutually-exclusive variants?
  └─ Union of config classes
     + Annotated[..., tyro.conf.subcommand("name")]

Need positional args?
  └─ Annotated[T, tyro.conf.Positional]

Want to flatten an inner config's prefix?
  └─ Annotated[Inner, tyro.conf.arg(name="")]   (single level)
  └─ config=(tyro.conf.OmitArgPrefixes,)         (everywhere)
```

## `tyro.cli`

```python
tyro.cli(
    f,                                  # dataclass type, msgspec.Struct, pydantic BaseModel,
                                        # attrs class, NamedTuple, TypedDict, function, or Union of any
    *,
    prog: str | None = None,            # program name in helptext
    description: str | None = None,     # override class/function docstring
    args: Sequence[str] | None = None,  # parse this list instead of sys.argv
    default: T | MISSING = MISSING,     # seed defaults from an instance; only for structs/classes
    return_unknown_args: bool = False,  # if True returns (result, list[str]) of leftover argv
    use_underscores: bool = False,      # render flags with _ in helptext
    console_outputs: bool = True,       # set False on non-rank-0 distributed workers
    add_help: bool = True,
    config: Sequence[Marker] | None = None,    # global markers applied to the whole tree
    compact_help: bool = False,         # condensed help; users can ask for --help-verbose
) -> T
```

Common patterns:

```python
# Parse from sys.argv
args = tyro.cli(Args)

# Parse from a list (tests, notebooks)
args = tyro.cli(Args, args=["--lr", "1e-3", "--epochs", "5"])

# Override defaults at call site
args = tyro.cli(Args, default=Args(lr=1e-3, run_name=tyro.MISSING))

# Apply markers to the whole tree
args = tyro.cli(Args, config=(tyro.conf.OmitArgPrefixes,))

# Capture unknown args (e.g. for forwarding to a subprocess)
args, unknown = tyro.cli(Args, return_unknown_args=True)
```

## `tyro.extras.subcommand_cli_from_dict`

Git-style multi-subcommand CLI. The dict keys become subcommand names; values are functions or classes.

```python
import tyro

def _main() -> None:
    tyro.extras.subcommand_cli_from_dict({
        "train":   train.main,        # def main(args: TrainArgs) -> None
        "eval":    eval_.main,
        "prepare": prepare.main,
    })

if __name__ == "__main__":
    _main()
```

```
$ python -m yourpkg train --lr 1e-4
$ python -m yourpkg eval --checkpoint runs/last.pt
$ python -m yourpkg --help            # lists subcommands
$ python -m yourpkg train --help      # subcommand help
```

Full signature:

```python
subcommand_cli_from_dict(
    subcommands: dict[str, Callable | type],
    *,
    prog: str | None = None,
    description: str | None = None,
    args: Sequence[str] | None = None,
    use_underscores: bool = False,
    console_outputs: bool = True,
    add_help: bool = True,
    config: Sequence[Marker] | None = None,
    sort_subcommands: bool = False,
    registry: ConstructorRegistry | None = None,
)
```

Each value is introspected as if passed directly to `tyro.cli`.

## `tyro.extras.overridable_config_cli`

"Named experiments" pattern: user picks a base config by name, then overrides individual fields.

```python
from dataclasses import dataclass
import tyro

@dataclass
class ExperimentConfig:
    lr: float
    batch_size: int
    epochs: int

config = tyro.extras.overridable_config_cli({
    "small": ("Quick sanity check.",
              ExperimentConfig(lr=3e-4, batch_size=8,   epochs=2)),
    "big":   ("Full training run.",
              ExperimentConfig(lr=1e-4, batch_size=256, epochs=100)),
})
```

```
$ python script.py small                  # small defaults
$ python script.py small --epochs 5       # pick small, override epochs
$ python script.py big --lr 5e-5
```

Dict values are `(description, instance)` tuples. The description is shown in subcommand-list helptext.

## `tyro.extras.SubcommandApp`

Decorator-style subcommands (click-like API).

```python
import tyro
from tyro.extras import SubcommandApp

app = SubcommandApp()

@app.command
def greet(name: str, loud: bool = False) -> None:
    """Greet someone."""
    msg = f"Hello, {name}!"
    print(msg.upper() if loud else msg)

@app.command(name="add")
def addition(a: int, b: int) -> None:
    """Add two numbers."""
    print(a + b)

if __name__ == "__main__":
    app.cli()
```

```
$ python script.py greet --name world
$ python script.py add --a 3 --b 4
```

Use when:

- You prefer one function per subcommand colocated with its decorator.
- The number of subcommands is small enough to fit in one file.

For a larger CLI split across modules, `subcommand_cli_from_dict` (with the dict assembled from imports) is cleaner.

## `tyro.extras.subcommand_type_from_defaults`

Build a `Union[Annotated[T, subcommand("name", default=...)], ...]` from a dict of instances. Useful when you want named variants whose defaults are computed at runtime.

```python
from typing import TYPE_CHECKING
import tyro
from msgspec import Struct, field

class Optim(Struct, kw_only=True):
    lr: float = 1e-3
    weight_decay: float = 0.0

defaults = {
    "adam":  Optim(lr=1e-3),
    "lion":  Optim(lr=1e-4),
    "sgd":   Optim(lr=1e-1, weight_decay=1e-4),
}

if TYPE_CHECKING:
    OptimChoice = Optim
else:
    OptimChoice = tyro.extras.subcommand_type_from_defaults(defaults)

class TrainArgs(Struct, kw_only=True):
    optim: OptimChoice
```

The `if TYPE_CHECKING:` guard keeps static checkers happy — they see `Optim`, while runtime gets the generated `Union`.

Full signature:

```python
subcommand_type_from_defaults(
    defaults: Mapping[str, T],
    descriptions: Mapping[str, str] | None = None,
    *,
    prefix_names: bool = True,
    sort_subcommands: bool = False,
) -> type
```

## `tyro.extras.literal_type_from_choices`

Build a `Literal[*choices]` type at runtime from a list of strings.

```python
from typing import TYPE_CHECKING
import tyro

CHOICES = ["adam", "lion", "sgd", "rmsprop"]

if TYPE_CHECKING:
    OptimName = str
else:
    OptimName = tyro.extras.literal_type_from_choices(CHOICES)

def main(optimizer: OptimName = "adam") -> None: ...
tyro.cli(main)
# --optimizer {adam,lion,sgd,rmsprop}
```

## `tyro.extras.Verbosity`

Standard `-v` / `--verbose` and `-q` / `--quiet` count flags mapping to Python logging levels. The two are mutually exclusive.

```python
import logging
from dataclasses import dataclass, field
from typing import Annotated
import tyro
from tyro.conf import OmitArgPrefixes
from tyro.extras import Verbosity

@dataclass
class Args:
    """Process files with configurable log verbosity."""
    verbosity: Annotated[Verbosity, OmitArgPrefixes] = field(
        default_factory=Verbosity
    )

args = tyro.cli(Args)
logging.basicConfig(level=args.verbosity.log_level())
```

```
$ python script.py -v          # one level more verbose than default
$ python script.py -vv         # two levels more
$ python script.py -q          # one level quieter
$ python script.py --verbose   # long form
```

Without `OmitArgPrefixes`, flags would be `--verbosity.verbose` / `--verbosity.quiet`. The short aliases `-v` / `-q` always work regardless.

## `tyro.extras.get_parser`

Returns the underlying `argparse.ArgumentParser` without parsing. Useful for shell completion (`argcomplete`, `shtab`) and tests.

```python
import tyro
parser = tyro.extras.get_parser(Args)
# parser is a standard argparse.ArgumentParser

# Hook into argcomplete:
import argcomplete
argcomplete.autocomplete(parser)
```

Accepts the same kwargs as `tyro.cli` (minus `args=`).

## `tyro.extras.from_yaml` / `to_yaml` (deprecated)

YAML round-trip helpers. Still functional but **deprecated**. Use case: persisting a parsed config to a file or replaying one. Note: nested class/enum names must be globally unique.

```python
yaml_str = tyro.extras.to_yaml(args)
args2 = tyro.extras.from_yaml(Args, yaml_str)
```

For new code, prefer `msgspec.yaml` / `msgspec.json` on the encoded representation, and let users override via `default=` to `tyro.cli`.

## Choosing an entry point

| Need | Reach for |
|---|---|
| One CLI, one config | `tyro.cli` |
| Multiple commands, dispatched by name | `subcommand_cli_from_dict` or `SubcommandApp` |
| "Pick a preset, then tweak" | `overridable_config_cli` |
| Programmatic parser (completion, tests) | `get_parser` |
| Subcommand variants whose defaults come from runtime data | `subcommand_type_from_defaults` |
| Choices from runtime data | `literal_type_from_choices` |
| Standard `-v`/`-q` flags | `Verbosity` |
