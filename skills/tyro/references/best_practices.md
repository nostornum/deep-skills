# Best Practices

Gotchas, testing patterns, distributed silencing, `compact_help`, `Verbosity`, common errors, anti-patterns, and a brief comparison with click / argparse / fire.

## Testing CLIs

`tyro.cli` accepts an `args=` list. Use it in unit tests and notebooks instead of patching `sys.argv`:

```python
import tyro

def test_parses_lr_and_epochs():
    args = tyro.cli(Args, args=["--lr", "1e-3", "--epochs", "5"])
    assert args.lr == 1e-3
    assert args.epochs == 5

def test_required_field_missing():
    import pytest
    with pytest.raises(SystemExit):
        tyro.cli(Args, args=[])
```

For programmatic help inspection, use `tyro.extras.get_parser`:

```python
parser = tyro.extras.get_parser(Args)
help_text = parser.format_help()
assert "--lr" in help_text
```

## Silencing output in distributed training

In multi-rank setups (accelerate / torchrun / Slurm), only rank 0 should print help / error text. Pass `console_outputs=False` on the other ranks:

```python
import os
args = tyro.cli(
    Args,
    console_outputs=(os.environ.get("LOCAL_RANK", "0") == "0"),
)
```

**Caveat**: `console_outputs=False` disables help printing too. If rank-N gets `--help`, it will exit silently with no output. In practice this is fine — the user is interacting from rank 0.

## `compact_help` for large configs

Configs with many fields produce wall-of-text helptext. `compact_help=True` omits per-field descriptions in the main `--help` output; users can opt into full help with `--help-verbose`:

```python
args = tyro.cli(ServerConfig, compact_help=True)
```

Default `--help` shows: flag name, type, default.
`--help-verbose` shows: above + per-field descriptions and group headings.

Use for configs with ≥20 fields where the surface is otherwise overwhelming.

## `Verbosity` for standard `-v`/`-q` flags

```python
from tyro.extras import Verbosity
from tyro.conf import OmitArgPrefixes
from typing import Annotated
from dataclasses import dataclass, field
import logging

@dataclass
class Args:
    verbosity: Annotated[Verbosity, OmitArgPrefixes] = field(default_factory=Verbosity)

args = tyro.cli(Args)
logging.basicConfig(level=args.verbosity.log_level())
```

`-v` / `-vv` / `-q` / `-qq` map to logging levels. `-v` and `-q` are mutually exclusive — tyro enforces it.

## Common errors and fixes

### `TypeError: non-default argument 'name' follows default argument`

Required field declared after a field with a default in a dataclass / msgspec Struct.

**Fix**: set `kw_only=True` (preferred) or reorder fields.

```python
# Bad
@dataclass
class Args:
    lr: float = 1e-3
    name: str               # ← required after optional

# Good
@dataclass(kw_only=True)
class Args:
    lr: float = 1e-3
    name: str
```

### `Cannot infer constructor for type <X>`

tyro doesn't know how to build the type from a CLI string.

**Fix**: provide a custom constructor via `tyro.conf.arg(constructor=...)` or register via `tyro.constructors.PrimitiveConstructorSpec`. See `markers.md`.

### "field has no default" — but you provided one via `default=`

`tyro.MISSING` was used somewhere in the chain, marking the field required regardless of class-level default. Check the `default=` argument to `tyro.cli`.

### Subcommand name collisions

When multiple Union variants resolve to the same kebab-case name (e.g. two classes named differently in Python but identical after kebab conversion), tyro errors at parser construction.

**Fix**: pin variant names with `tyro.conf.subcommand("explicit-name")`.

### `__post_init__` runs unexpectedly twice

When `default=` is provided to `tyro.cli`, the seed instance also gets `__post_init__` called, then the final instance does too.

**Fix**: keep `__post_init__` idempotent and side-effect-free.

## Anti-patterns

### Reaching for markers before needing them

Most fields need no `Annotated` / marker wrapping. Start with plain type hints; reach for markers only when default behavior doesn't fit.

```python
# Anti-pattern: marker not needed
lr: Annotated[float, tyro.conf.arg(help="Learning rate")] = 1e-3
"""Learning rate."""        # ← attribute docstring already supplies this

# Better
lr: float = 1e-3
"""Learning rate."""
```

### YAML config loading when `default=` is enough

```python
# Anti-pattern: external YAML file driving the CLI
import yaml
defaults = yaml.safe_load(open("config.yaml"))
args = tyro.cli(Args, default=Args(**defaults))

# Usually better — pin a base config in code:
args = tyro.cli(Args, default=Args(lr=1e-3, epochs=10))
# or, for "named experiments":
args = tyro.extras.overridable_config_cli({...})
```

YAML-driven configs make the CLI's contract opaque. Use only if the surrounding system already requires it.

### Combining `OmitArgPrefixes` with many subcommand fields

`OmitArgPrefixes` flattens everything below it. With multiple Union fields, child flag names will collide silently.

**Fix**: use `tyro.conf.arg(name="")` for single-level flattening, or restructure so the flattened subtree is narrow.

### Wrapping things in `Annotated` just to satisfy a type checker

If your linter complains about a runtime-only call like `subcommand_type_from_defaults`, hide it behind `if TYPE_CHECKING:`. Don't fight tyro to make static checkers happy — they don't model runtime parser construction.

```python
if TYPE_CHECKING:
    OptimChoice = Optim
else:
    OptimChoice = tyro.extras.subcommand_type_from_defaults(defaults)
```

### Plain functions with `default=`

`default=` is not supported for plain functions. Put defaults in the signature:

```python
# Bad
def main(name: str, lr: float) -> None: ...
tyro.cli(main, default=...)    # not supported

# Good
def main(name: str, lr: float = 1e-3) -> None: ...
tyro.cli(main)
```

If you need per-call overrides, wrap the function in a dataclass/msgspec config that takes `default=`.

## Quirks worth remembering

- **`_` and `-` are interchangeable in flags**, but only in flag *names* (`--my-flag` ↔ `--my_flag`). The dot separator (`.`) for nested fields is not interchangeable.
- **`__post_init__` runs twice when `default=` is set.** Keep it pure.
- **`tyro.MISSING` overrides class-level defaults.** Use it at the `tyro.cli(default=...)` call site to enforce a required CLI arg even when the type provides a default.
- **`console_outputs=False` disables help too.** Only set on non-rank-0 distributed workers.
- **Variable-length `list[Dataclass]` cannot be extended from the CLI.** Length is fixed by the default. For dynamic lists, use a primitive list and parse to structs post-hoc, or accept JSON via a custom constructor.
- **`to_yaml` / `from_yaml` are deprecated.** Use `msgspec.yaml` or pickle for round-trip persistence. Nested class/enum names must also be globally unique.
- **Sweep tools (wandb, etc.) often need `UsePythonSyntaxForLiteralCollections`** so `--field "[1,2,3]"` is parsed as a Python literal rather than a string.

## Performance

tyro builds an argparse parser at startup. For most CLIs the cost is invisible (<10ms). When it matters:

- **Avoid unnecessary nesting depth.** Each level adds a layer to the parser.
- **`tyro.extras.get_parser(...)` caches**: when running tests, reuse the parser instead of rebuilding it per assertion.
- **Don't import the world at module load.** Defer heavy imports until after `tyro.cli` returns — startup time is dominated by user code, not tyro.

## Comparison with other CLI libraries

| | tyro | argparse | click | fire |
|---|---|---|---|---|
| Type-driven | yes | no | no (decorator-driven) | yes (introspective) |
| Auto helptext from docstrings | yes | no | partial (via decorators) | partial |
| Nested config (dot-paths) | yes | manual | manual | partial |
| Subcommands via Unions | yes | manual | manual | manual |
| Static type-checker friendly | mostly (mypy quirks on unions) | n/a | n/a | n/a |
| Speed of building parser | fast | fastest | fast | slow |
| Stable API | yes (core) | yes | yes | yes |
| Comes with `--help` | yes | yes | yes | partial |

**Pick tyro when**: your config is already typed (dataclass / msgspec / pydantic / attrs) and you want zero-boilerplate CLI generation. Tyro is the highest-leverage choice when types are the source of truth.

**Pick click when**: you want a decorator-driven CLI with strong ecosystem (autocomplete, formatting, shell integrations) and you don't already have typed configs.

**Pick argparse when**: you need minimal dependencies or fine-grained control of the parser. tyro produces argparse parsers — drop down to `get_parser` if needed.

**Pick fire when**: you want zero-config introspective CLIs over arbitrary Python objects (especially classes with methods). Less typing rigor but faster to prototype.

## Recommended defaults for new code

1. **Use `kw_only=True`** on dataclass / msgspec configs.
2. **Use attribute docstrings** for helptext — cleanest source.
3. **Don't reach for markers** until plain types don't suffice.
4. **One config class per entry point.** Multiple subcommands → `subcommand_cli_from_dict` or `SubcommandApp`.
5. **Use `tyro.MISSING` for "required even though default exists"** rather than removing the default and rewriting the type.
6. **Run `--help`** after edits — it's the fastest sanity check.
7. **`console_outputs=` on distributed**, `compact_help=True` for large configs, `Verbosity` for `-v`/`-q`.
