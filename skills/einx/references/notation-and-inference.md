# Notation And Inference

This reference distills the `einx` advanced tutorial.

## Axis constraints

`einx` tries to infer axis lengths from input shapes. When the inputs do not fully constrain an expression, pass explicit keyword arguments:

```python
y = einx.id("a -> a b", x, b=42)
```

You can also add constraints for already known axes to assert that the expression matches the intended shape.

## Numerical axes

A numeric axis name is shorthand for an axis with a fixed size:

```python
y = einx.id("a b -> a b 3", x)
```

Treat repeated numeric literals carefully. They represent distinct axes, not a shared named axis.

## Axis squeezing

Any vectorized axis of length `1` may be removed:

```python
y = einx.id("a 1 c -> a c", x)
```

This only works for axes that are actually length `1` after matching.

## Implicit outputs

Some operations allow the output expression to be omitted.

Common cases from the docs:
- identity-like operations preserve the input structure
- reductions remove bracketed axes
- arg-operations replace bracketed axes with a new bracketed axis
- elementwise operations infer a unique output only when one input expression clearly contains the axes of all others

Examples:

```python
y = einx.softmax("a b [c]", x)
y = einx.sum("a b [c]", x)
y = einx.argmax("b [h w] c", x)
```

If the output is ambiguous, write it explicitly.

## Flattened axes

Parentheses denote a flattened axis in row-major order:

```python
y = einx.id("a (b c) -> a b c", x, b=4)
```

When decomposing a flattened axis, the input constrains only the flattened size. At least one sub-axis may need an explicit constraint.

## Concatenated axes

Use `+` inside parentheses to represent concatenation:

```python
y = einx.id("(a + b) c -> a c, b c", x, a=3)
```

The advanced tutorial notes that concatenated axes currently matter mainly for `einx.id`, because concatenation changes the number of input or output tensors.

## Nesting

Brackets, flattened axes, concatenated axes, ellipses, commas, and arrows can be nested to express more complex operations concisely.

## Ellipses

An ellipsis repeats the preceding subexpression zero or more times:

```python
y = einx.mean("b [...] c", x)
y = einx.id("b (s ds)... c -> b s... (ds... c)", x, ds=k)
```

Useful points from the docs:
- ellipses can be named or anonymous
- the repetition count is inferred from the matched tensor shapes
- constraints for ellipsis-expanded axes may be given as scalars or as lists
- repeated ellipses with the same named axes must expand consistently

## Tensor factories

A tensor factory can stand in for a tensor whose shape should be inferred from the expression. Because factories do not constrain axis lengths themselves, remaining unconstrained axes usually need explicit keyword arguments.

## Source

Distilled from:
- https://einx.readthedocs.io/en/latest/gettingstarted/advanced.html
