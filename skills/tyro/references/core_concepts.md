# Core Concepts

How tyro turns Python type hints into a CLI: field-to-flag translation, naming rules, boolean pairing, helptext harvesting, validation, and error reporting.

## The translation model

tyro inspects a config type at runtime and walks its fields. Each field becomes a CLI argument; nested fields become dotted paths.

```python
from dataclasses import dataclass
import tyro

@dataclass
class OptimArgs:
    lr: float = 1e-4
    weight_decay: float = 0.0

@dataclass
class TrainArgs:
    seed: int = 42
    optim: OptimArgs

tyro.cli(TrainArgs)
```

Resulting flags:

```
--seed INT                    [default 42]
--optim.lr FLOAT              [default 0.0001]
--optim.weight-decay FLOAT    [default 0.0]
```

The mapping rules:

- **One field → one flag** (or one nested namespace).
- **Field path → dot-joined flag name**: `optim.lr` → `--optim.lr`.
- **Underscores → hyphens in flag display**: `weight_decay` → `--weight-decay`. When parsing, `--weight-decay` and `--weight_decay` are interchangeable.
- **No default → required**.
- **Default present → optional**, displayed in help as `[default ...]`.

## Naming rules

- `_` and `-` are interchangeable when parsing. `--my-flag` and `--my_flag` both match a field named `my_flag`.
- `.` is the nesting separator. It is not interchangeable — `--optim.lr` is required, `--optim-lr` does not work.
- `use_underscores=True` passed to `tyro.cli` renders flags with `_` instead of `-` in `--help` output (parsing accepts both regardless).

## Boolean flag pairing

A `bool` field with a default automatically generates a `--flag` / `--no-flag` pair:

```python
@dataclass
class Args:
    fast: bool = False
    debug: bool = True

# CLI:
#   --fast        sets True
#   --no-fast     sets False
#   --debug       sets True
#   --no-debug    sets False
```

A `bool` with no default requires an explicit literal:

```python
@dataclass
class Args:
    verbose: bool       # required
# python script.py --verbose True   # OK
# python script.py --verbose         # ERROR — value required
```

Modifiers:

- `Annotated[bool, tyro.conf.FlagConversionOff]` — always require `True`/`False` literal.
- `Annotated[bool, tyro.conf.FlagCreatePairsOff]` — generate only the non-default side (`--quiet` only, no `--no-quiet`).

## Helptext sources

tyro harvests help text from multiple sources. Precedence (highest first):

1. **`tyro.conf.arg(help="...")`** on the field — explicit override.
2. **Attribute docstring** — a string literal immediately under the field declaration.
3. **Class / function docstring** — the top-level docstring becomes the CLI description. Google/NumPy/ReST `Args:` blocks are parsed and applied per-field.
4. **Preceding / inline comments** — `# This is a comment` directly above or beside the field. Disable globally with `tyro.conf.HelptextFromCommentsOff`.
5. **Library-specific** — `pydantic.Field(description=...)` and `msgspec` field descriptions are picked up.

Attribute docstrings are the cleanest source:

```python
@dataclass
class Args:
    lr: float = 1e-4
    """Learning rate for the optimizer."""

    epochs: int = 10
    """Number of training epochs."""
```

For a Google-style `Args:` block in a docstring:

```python
@dataclass
class Args:
    """Train a model.

    Args:
        lr: Learning rate.
        epochs: Number of training epochs.
    """
    lr: float = 1e-4
    epochs: int = 10
```

The top-level docstring becomes the CLI's description unless overridden by `description=` to `tyro.cli`.

## Required vs optional fields

A field is **required** if it has no default value or factory. Required fields must be provided on the CLI; tyro errors out otherwise.

```python
@dataclass
class Args:
    name: str                    # required
    lr: float = 1e-3             # optional

# python script.py --name foo            # OK
# python script.py                       # ERROR: missing --name
```

For dataclasses and msgspec Structs, required-without-default fields must precede optional fields *unless* you set `kw_only=True`:

```python
# Errors: "non-default argument 'name' follows default argument"
@dataclass
class Args:
    lr: float = 1e-3
    name: str                    # required after optional

# Fix:
@dataclass(kw_only=True)
class Args:
    lr: float = 1e-3
    name: str
```

`kw_only=True` is the simplest fix and is preferred — it sidesteps reordering churn when adding fields later.

## `tyro.MISSING`

`tyro.MISSING` marks a field as required from the CLI even when the class-level default would supply a value. Useful with `default=` to enforce that a specific field must be set:

```python
args = tyro.cli(
    TrainArgs,
    default=TrainArgs(
        lr=1e-3,
        run_name=tyro.MISSING,   # required even though class has a default
    ),
)
```

## Validation

tyro validates argument types at parse time. Errors map to clean argparse-style messages:

```
$ python script.py --lr not-a-number
usage: script.py [-h] [--lr FLOAT] [--epochs INT] --name STR
script.py: error: argument --lr: invalid float value: 'not-a-number'
```

Type-specific validation:

- `Literal[...]` and `Enum` — invalid values error with `choices` enumerated.
- `Annotated[T, tyro.conf.constructor=...]` — custom constructors throw at parse time on bad input.
- `T | None` — pass `--flag None` to set None explicitly. Suppress with `tyro.conf.DisallowNone`.

## Parsing flow

A high-level view of what `tyro.cli(Config)` does:

1. **Introspect** `Config` (resolve generics, walk fields, extract types and defaults).
2. **Build an argparse parser** with one argument per leaf field.
3. **Parse `sys.argv`** (or the `args=` list).
4. **Construct** `Config` from the parsed values, walking back up the nesting tree.
5. **Run `__post_init__`** on dataclasses / msgspec Structs (if defined). Note: this runs on the seed instance when `default=` is provided, *and* on the final instance — avoid mutation or side effects.

## Error reporting

tyro errors print a usage line, the failing argument, and the message. For nested errors (e.g. inside a subcommand), the path is included:

```
$ python script.py time:logit-normal --time.mean abc
script.py time:logit-normal: error: argument --time.mean: invalid float value: 'abc'
```

`--help` is always available unless `add_help=False` is passed to `tyro.cli`.

## Static vs runtime typing

tyro is a **runtime** library — it inspects types at parse time. Annotations are evaluated. A few static-typing implications:

- mypy / pyright type-check the parsed result against the declared config type.
- Some patterns (especially `Union` of struct types) don't type-check cleanly in mypy — annotate the result explicitly or switch to pyright.
- Helpers like `tyro.extras.subcommand_type_from_defaults` and `tyro.extras.literal_type_from_choices` return runtime types. For static checkers, hide the call behind `if TYPE_CHECKING:`.

## Underlying engine

tyro builds on top of `argparse`. The full parser is accessible via `tyro.extras.get_parser(Config)` — useful for shell completion (`argcomplete`, `shtab`), tests, or programmatic help inspection.

```python
parser = tyro.extras.get_parser(Args)
# parser is a standard argparse.ArgumentParser
```
