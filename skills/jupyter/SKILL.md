---
name: jupyter
description: Create or update Jupyter notebooks using a standard notebook layout and validation workflow. Use when a task involves adding a new notebook, restructuring an existing notebook, cleaning up notebook imports, setting notebook environment cells, or enforcing notebook conventions for local-package development. Also use when the user explicitly invokes $jupyter.
license: MIT
metadata:
  version: "1.0"
---

# Notebook Development

Create or edit Jupyter notebooks with a consistent top-of-notebook structure.

## Quick start

Every new notebook starts from this four-cell skeleton:

```python
# Cell 1
%load_ext autoreload
%autoreload 2
```

```python
# Cell 2
# all shared imports for the notebook
```

```python
# Cell 3
# environment, paths, device, and global runtime config
```

```python
# Cell 4, if applicable
# dataset construction
```

## Instructions

### Cell ordering

Keep the first cells in this exact order:

1. **Autoreload** — always first, so local package edits are picked up while iterating:
   ```python
   %load_ext autoreload
   %autoreload 2
   ```

2. **Imports** — all shared imports in one place; later cells should not repeat them unless a local import materially improves clarity.

3. **Environment / runtime setup** — paths, device, and notebook-wide settings:
   ```python
   device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
   ```

4. **Dataset construction** — only if the notebook uses one; skip this cell otherwise.

### Modifying an existing notebook

- Preserve cell 1 exactly as shown above.
- Consolidate imports into cell 2.
- Keep environment setup ahead of model, dataset, or experiment code.
- Move dataset construction into cell 4 when applicable.

### Writing imports

- Remove duplicates and stale imports.
- Keep imports compatible with the repository's Ruff configuration.
- Prefer readable grouped imports over ad hoc imports scattered across later cells.

## Validation

After every notebook modification, lint and format with Ruff (from the repo root):

```bash
uv run ruff check --fix path/to/notebook.ipynb
uv run ruff format path/to/notebook.ipynb
```

If `uv run ruff` is unavailable:

```bash
uvx ruff check --fix path/to/notebook.ipynb
uvx ruff format path/to/notebook.ipynb
```

## Best practices

- Use `uv` for all Python commands.
- Keep imports and formatting aligned with the top-level `pyproject.toml`.
- Prefer concise, reusable setup cells over repeated boilerplate across cells.
