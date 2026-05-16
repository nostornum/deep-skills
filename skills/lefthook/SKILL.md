---
name: lefthook
description: Configure and manage git hooks with lefthook. Use when setting up pre-commit, pre-push, or other git hooks, adding linting/formatting/type-checking to a commit workflow, writing or editing lefthook.yml, or troubleshooting hook execution. Covers jobs, parallel execution, staged file filtering, stage_fixed, skip/only conditions, and lefthook-local overrides.
license: MIT
metadata:
  version: "1.0"
---

# lefthook

Lefthook is a fast, language-agnostic git hooks manager. It replaces pre-commit, husky, and similar tools.

For the full property reference see [references/configuration.md](references/configuration.md).

## When to use lefthook

Use lefthook when:
- A `lefthook.yml` (or `.lefthook.yml`, `lefthook.toml`, etc.) is present in the project
- The user wants to add git hooks for linting, formatting, or type-checking
- The user asks about `lefthook install`, hook execution, or `lefthook-local.yml`

## Installation

### In a uv Python project (preferred for Python repos)

```bash
uv add --dev lefthook
uv run lefthook install   # writes hooks into .git/hooks/
```

### Other package managers

```bash
# npm / pnpm / yarn
npm install --save-dev lefthook && npx lefthook install

# Homebrew
brew install lefthook && lefthook install
```

## Config file

Lefthook reads the first config file it finds (use only one format per project):

| Format | File names |
|--------|-----------|
| YAML   | `lefthook.yml`, `.lefthook.yml`, `.config/lefthook.yml` |
| TOML   | `lefthook.toml`, `.lefthook.toml` |
| JSON   | `lefthook.json`, `.lefthook.json` |

## Config structure

```
root
└── <git-hook-name>           # e.g. pre-commit, pre-push, commit-msg
    ├── parallel: true/false
    ├── piped: true/false
    └── jobs:
        - name: <label>
          run: <shell command>
          glob: "*.py"
          stage_fixed: true
```

### Minimal example

```yaml
# lefthook.yml

pre-commit:
  jobs:
    - run: echo "hello from pre-commit"
```

### Parallel jobs with staged file filtering

```yaml
pre-commit:
  parallel: true
  jobs:
    - name: format
      glob: "*.py"
      run: uv run ruff format {staged_files}
      stage_fixed: true
    - name: lint
      glob: "*.py"
      run: uv run ruff check --fix {staged_files}
      stage_fixed: true
    - name: typecheck
      glob: "*.py"
      run: uv run ty check {staged_files}
```

## File templates in `run`

| Template | Expands to |
|----------|-----------|
| `{staged_files}` | Files staged for commit (filtered by `glob`) |
| `{push_files}` | Committed but not yet pushed files |
| `{all_files}` | All git-tracked files |
| `{files}` | Output of a custom `files:` command |
| `{0}` | All git hook arguments as a single string |
| `{1}`, `{2}` … | Individual git hook arguments |
| `{lefthook_job_name}` | Current job name |

## Key job properties

| Property | Description |
|----------|-------------|
| `name` | Label shown in output; enables merging with `lefthook-local.yml` |
| `run` | Shell command to execute |
| `glob` | File pattern(s) to filter the files template |
| `root` | Working directory; also filters file paths |
| `stage_fixed` | Auto `git add` modified files after run (`pre-commit` only) |
| `skip` | Skip conditions: `merge`, `rebase`, `ref: main`, `run: <cmd>` |
| `only` | Inverse of `skip` — run only when condition is met |
| `env` | Environment variables for the job |
| `tags` | Tags for selective exclusion via `exclude_tags` |
| `fail_text` | Custom failure message |
| `priority` | Execution order when sequential (0 = last) |
| `group` | Nested sub-jobs with their own `parallel`/`piped` flow |

## Common patterns

### Skip on merge/rebase

```yaml
pre-commit:
  jobs:
    - name: lint
      run: yarn lint {staged_files}
      skip:
        - merge
        - rebase
```

### Run only on specific branches

```yaml
pre-push:
  jobs:
    - name: full-test-suite
      run: pytest
      only:
        - ref: main
```

### Piped sequential jobs (stop on failure)

```yaml
pre-commit:
  piped: true
  jobs:
    - run: uv run ruff format {staged_files}
      stage_fixed: true
    - run: uv run ruff check --fix {staged_files}
      stage_fixed: true
    - run: uv run ty check {staged_files}
```

### Grouped sub-jobs

```yaml
pre-commit:
  parallel: true
  jobs:
    - name: db-migrate
      root: backend/
      group:
        piped: true
        jobs:
          - run: uv run alembic upgrade head
          - run: uv run pytest tests/db/
    - name: lint
      run: uv run ruff check {staged_files}
```

## lefthook-local.yml

Personal overrides that should not be committed. Add to global `~/.gitignore`.

```yaml
# lefthook-local.yml — personal overrides, not committed

pre-commit:
  parallel: true          # run everything in parallel locally
  jobs:
    - name: typecheck
      skip: true          # skip ty locally for speed
```

Named jobs (those with `name:`) are merged by name; unnamed jobs are appended.

## CLI commands

```bash
lefthook install          # install hooks into .git/hooks/
lefthook uninstall        # remove hooks
lefthook run pre-commit   # run a hook manually
lefthook run pre-commit --commands lint  # run a specific command
lefthook validate         # validate lefthook.yml
lefthook dump             # print the merged effective config
```

## Tips

- Always run `lefthook install` after adding or changing `lefthook.yml`
- Use `parallel: true` at the hook level to speed up independent jobs
- Use `piped: true` when jobs must run in order and depend on each other
- `stage_fixed: true` is only meaningful on the `pre-commit` hook
- Use `lefthook dump` to debug the merged config when using `extends` or `lefthook-local.yml`
