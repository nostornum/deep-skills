# API Map

This reference summarizes the public operation groups listed in the `einx` API operations docs and the frontend ops source page.

## Miscellaneous

- `einx.id`
- `einx.dot`
- `einx.flip`
- `einx.roll`
- `einx.sort`
- `einx.softmax`
- `einx.log_softmax`

Use this group for identity-like layout transforms, contractions, ordering changes, and normalization over bracketed axes.

## Scalar

- `einx.add`
- `einx.subtract`
- `einx.multiply`
- `einx.true_divide`
- `einx.floor_divide`
- `einx.divide`
- `einx.logical_and`
- `einx.logical_or`
- `einx.where`
- `einx.less`
- `einx.less_equal`
- `einx.greater`
- `einx.greater_equal`
- `einx.equal`
- `einx.not_equal`
- `einx.maximum`
- `einx.minimum`
- `einx.logaddexp`

Use this group for elementwise and broadcasted scalar-valued operations.

## Reduction

- `einx.sum`
- `einx.mean`
- `einx.var`
- `einx.std`
- `einx.prod`
- `einx.count_nonzero`
- `einx.any`
- `einx.all`
- `einx.max`
- `einx.min`
- `einx.logsumexp`

Use this group when bracketed axes should be reduced.

## Indexing

- `einx.get_at`
- `einx.set_at`
- `einx.add_at`
- `einx.subtract_at`
- `einx.argmax`
- `einx.argmin`
- `einx.argsort`

Use this group for gathers, scatters, indexed updates, and arg-style indexing results.

## Choosing quickly

- Start with `id` for pure rearrangement, flattening, unflattening, splitting, or concatenation.
- Use `dot` for contractions and matmul-like operations.
- Use a scalar op for elementwise logic with broadcasting.
- Use a reduction op when the bracketed axes should be aggregated.
- Use an indexing op when coordinates or index tensors drive the result.

## Source

Distilled from:
- https://einx.readthedocs.io/en/latest/api/operations.html
- https://einx.readthedocs.io/en/latest/_modules/einx/_src/frontend/ops.html
