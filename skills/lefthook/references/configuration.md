# Lefthook Configuration Reference

Full property reference extracted from the [lefthook source docs](https://github.com/evilmartians/lefthook).

---

## Root-level properties

| Property | Description |
|----------|-------------|
| `assert_lefthook_installed` | Fail if lefthook binary is not found — useful in CI |
| `colors` | Enable/disable colored output |
| `extends` | List of other config files to merge into this one (globs supported) |
| `min_version` | Minimum lefthook version required |
| `no_auto_install` | Disable automatic hook installation |
| `no_tty` | Disable TTY mode |
| `output` | Control which output sections are printed |
| `remotes` | Pull hook configs from remote git repositories |
| `skip_lfs` | Skip git-lfs hooks |
| `glob_matcher` | Glob engine to use (`glob` or `doublestar`) |
| `templates` | Named string templates that can be referenced as `{template-name}` in `run` values |
| `source_dir` | Custom directory for scripts (default: `.lefthook/`) |
| `source_dir_local` | Custom directory for local scripts |
| `install_non_git_hooks` | Also install non-standard hooks (custom hook names) |
| `rc` | Path to an RC file for extra environment setup |

---

## Hook-level properties

Defined under a git hook name (e.g. `pre-commit:`, `pre-push:`, `commit-msg:`).

| Property | Description |
|----------|-------------|
| `parallel` | Run all jobs concurrently (default: `false`) |
| `piped` | Run sequentially, abort on first failure (default: `false`) |
| `jobs` | List of job definitions (modern syntax, added in 1.10.0) |
| `commands` | Map of command definitions (legacy syntax) |
| `scripts` | Map of script definitions (legacy syntax) |
| `files` | Custom command to generate the file list for `{files}` template |
| `skip` | Skip conditions for the entire hook |
| `only` | Run the entire hook only when condition is met |
| `exclude_tags` | Skip jobs that have any of these tags |
| `follow` | Stream STDOUT live as jobs run |
| `fail_on_changes` | Fail if any file is modified after the hook runs |
| `setup` | Commands to run before the hook jobs |

---

## Job-level properties

Items in the `jobs:` list (or keys in the `commands:` map).

### Execution

| Property | Description |
|----------|-------------|
| `run` | Shell command to execute. Supports file templates. |
| `script` | Path to a script file (relative to `source_dir`) |
| `runner` | Interpreter for `script` (e.g. `bash`, `node`, `python`) |
| `args` | Arguments appended to `run` or `script`; supports templates (added in 2.0.5) |
| `env` | Map of environment variables |
| `root` | Working directory; also used to filter file paths |
| `interactive` | Open `/dev/tty` for stdin; runs after non-interactive jobs |
| `use_stdin` | Pass OS stdin to the command |

### File filtering

| Property | Description |
|----------|-------------|
| `glob` | Glob pattern or list of patterns to filter file templates |
| `exclude` | Glob pattern or list to exclude from file templates |
| `file_types` | Filter by file type: `text`, `binary`, `executable`, `not executable`, `symlink`, `not symlink`, or MIME type (e.g. `text/html`) |
| `files` | Custom command to generate files for `{files}` template (overrides hook-level) |

### Flow control

| Property | Description |
|----------|-------------|
| `name` | Label shown in summary; named jobs can be merged by name in `lefthook-local.yml` |
| `tags` | List of tags; used with `exclude_tags` to skip jobs selectively |
| `skip` | Skip conditions: `merge`, `rebase`, `merge-commit`, `ref: <branch>`, `run: <cmd>` |
| `only` | Run only when condition is met (inverse of `skip`; `skip` takes precedence) |
| `priority` | Execution order when sequential; `0` means last (default: `0`) |
| `stage_fixed` | Auto `git add` files modified by the job (`pre-commit` only; default: `false`) |
| `follow` | Stream STDOUT live for this job |
| `fail_text` | Custom message shown when the job fails |
| `group` | Nest sub-jobs with independent `parallel`/`piped`/`jobs` (only `root`, `glob`, `exclude` propagate to nested jobs) |

---

## `skip` / `only` values

```yaml
skip: true                    # always skip
skip: merge                   # skip during merge
skip: rebase                  # skip during rebase
skip: merge-commit            # skip when HEAD is a merge commit
skip:
  - merge
  - rebase
  - ref: main                 # skip on main branch
  - ref: dev/*                # skip on dev/* branches (globs supported)
  - run: test "$NO_CI" -eq 1  # skip when shell command exits 0
```

---

## `templates` (root-level)

Define reusable strings injectable into any `run` value:

```yaml
templates:
  wrapper: docker-compose run --rm app

pre-commit:
  jobs:
    - run: {wrapper} ruff format {staged_files}
    - run: {wrapper} ruff check {staged_files}
```

Override per-developer in `lefthook-local.yml` without duplicating jobs.

---

## `extends`

Merge additional config files (evaluated before `lefthook-local.yml`):

```yaml
extends:
  - .config/lefthook-shared.yml
  - ../shared/lefthook.yml
  - projects/*/hooks.yml      # globs supported
```

Merge order: `lefthook.yml` → `extends` → `remotes` → `lefthook-local.yml`

---

## `remotes`

Pull hook configurations from a remote git repository:

```yaml
remotes:
  - git_url: git@github.com:myorg/hooks
    ref: v1.2.0
    configs:
      - lefthook/python.yml
      - lefthook/common.yml
```

---

## `lefthook-local.yml`

Personal overrides merged on top of `lefthook.yml`. Not committed; add to global `~/.gitignore`.

- Named jobs (with `name:`) are merged by name
- Unnamed jobs are appended
- Can add new hooks or override any property of existing ones

```yaml
# lefthook-local.yml

pre-commit:
  parallel: true
  jobs:
    - name: lint        # merges into the job named "lint" in lefthook.yml
      skip: true        # skip it locally
```
