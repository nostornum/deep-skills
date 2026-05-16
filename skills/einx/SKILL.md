---
name: einx
description: Use einx when writing or reviewing named-axis tensor expressions, translating reshape/transpose/reduction/gather logic into einx notation, choosing between built-in operations such as id, dot, reductions, scalar ops, and indexing ops, or debugging axis-constraint, inference, ellipsis, or composition errors. Also use when the user explicitly invokes $einx.
license: MIT
metadata:
  version: "1.0"
---

# einx

Guide for writing, reviewing, and debugging `einx` tensor expressions.

## Quick start

`einx` separates two concerns:

- the **elementary operation** (`id`, `dot`, `add`, `mean`, `get_at`, …)
- the **expression string** that describes tensor signatures and how the operation is vectorized across axes

```python
# reduce mean over spatial axes, keep batch and channel
einx.mean("b [h w] c", x)

# dot product along the last axis of x against a weight matrix
einx.dot("b n [d], [d] e -> b n e", x, W)
```

## Instructions

1. Choose the elementary operation from the API map before writing an expression.
2. Write the full input and output tensor signatures with meaningful axis names.
3. Mark the axes consumed by the elementary operation with `[brackets]`.
4. Add explicit axis constraints (e.g. `h=8`) where inference is ambiguous.
5. Use flattening `(h w)`, concatenation, ellipses `...`, or implicit outputs only when they make the expression clearer.
6. Prefer a built-in operation before reaching for a custom one.

## Best practices

- Prefer the shortest correct expression that makes axis meaning explicit.
- Keep axis names semantically meaningful and consistent within the local scope.
- If an `einx` expression becomes harder to read than the underlying tensor ops, simplify it.
- For inference failures, first check whether a new output axis, a flattened axis, or a concatenated axis needs an explicit constraint.

## References

Read only what you need:

- [references/foundations.md](references/foundations.md) — core mental model, brackets, vectorization, loop analogy, and basic examples
- [references/notation-and-inference.md](references/notation-and-inference.md) — constraints, numerical axes, squeezing, implicit outputs, flattened and concatenated axes, ellipses, and tensor factories
- [references/recipes.md](references/recipes.md) — common patterns: gathers, pooling, space-depth transforms, linear layers, normalization, attention, dropout, embeddings, and parameter factories
- [references/api-map.md](references/api-map.md) — grouped list of public operations from the API docs and frontend ops source
