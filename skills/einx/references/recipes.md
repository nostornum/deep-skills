# Recipes

This reference distills the example operations page into reusable patterns.

## Outer operations

```python
z = einx.multiply("i, j -> i j", x, y)
z = einx.add("i, j -> i j", x, y)
z = einx.subtract("i, j -> i j", x, y)
```

Use the same vectorization pattern with different elementary operations to express outer products, outer sums, and related broadcasted constructions.

## Gather and indexing

```python
pixel_colors = einx.get_at("b [h w] c, p [2] -> b p c", images, pixel_coords)
pixel_colors = einx.get_at("b [h w] c, b p [2] -> b p c", images, pixel_coords)
colors = einx.get_at("b [...] c, b p [i] -> b p c", tensor, coords)
```

These patterns generalize gathers from images to arbitrary spatial rank.

## Global mean and pooling

```python
y = einx.mean("b [...] c", x)
y = einx.mean("b [h w] c -> b c", x)
y = einx.mean("b (h [dh]) (w [dw]) c -> b h w c", x, dh=k, dw=k)
```

Use bracketed spatial axes for reductions and bracketed sub-axes inside flattened groups for pooling.

## Space-to-depth and depth-to-space

```python
y = einx.id("b (s ds)... c -> b s... (ds... c)", x, ds=k)
z = einx.id("b s... (ds... c) -> b (s ds)... c", y, ds=k)
```

These are inverse layout transforms expressed by swapping the input and output expressions.

## Broadcasted concatenation

```python
img_new = einx.id("b c1 h w, c2 -> b (c1 + c2) h w", img, vec)
```

The example docs highlight that concatenation in `einx` composes naturally with broadcasting and axis composition.

## Linear layers

```python
x = einx.dot("... [c_in], [c_in] c_out -> ... c_out", x, weight)
x = einx.add("... c_out, c_out -> ... c_out", x, bias)
```

Grouped and spatial variants are expressed by changing the axis structure rather than changing the overall style.

## Normalization

The docs show custom normalization functions adapted with backend helpers such as `adapt_with_vmap`, then vectorized with expressions like:

```python
x = einnormalize("... [c]", x)
x = einnormalize("[...] c", x)
x = einnormalize("b [s...] c", x)
```

Choose the bracketed axes based on what should be normalized together.

## Attention

```python
a = einx.dot("b q (h [c_in]), b k (h [c_in]) -> b q k h", q, k, h=8)
a = einx.softmax("b q [k] h", a)
x = einx.dot("b q [k] h, b [k] (h c_out) -> b q (h c_out)", a, v)
```

The same docs page also shows how to package a single-query attention primitive and vectorize it with backend adapters.

## Dropout

```python
x = einx.multiply("..., ...", x, dropout_factor)
x = einx.multiply("b ... c, b c", x, dropout_factor)
x = einx.multiply("b ..., b", x, dropout_factor)
```

Different dropout variants come from changing which axes share the same mask.

## Embeddings

```python
token_embeddings = einx.get_at("[v] c, b t -> b t c", vocabulary, token_indices)
```

This is a gather over the vocabulary axis.

## Tensor factories

```python
x = einx.dot("... [c_in], [c_in] c_out -> ... c_out", x, weight, c_out=64)
```

The docs also show passing parameter factories directly into `einx` calls so the tensor shape comes from the expression.

## Source

Distilled from:
- https://einx.readthedocs.io/en/latest/more/operations.html
