# Foundations

This reference distills the core ideas from the `einx` basic tutorial.

## Mental model

Every `einx` call has the same overall shape:

```python
outputs = einx.{elementary_operation}("{expression}", inputs...)
```

The expression plays three roles at once:
- It gives the full input and output tensor signatures.
- Bracketed subexpressions define the signature of the elementary operation.
- Unbracketed axes define how that elementary operation is vectorized across the tensors.

A useful way to read an expression is as loop notation: every unbracketed axis behaves like a loop variable, while bracketed axes are the sub-tensors consumed by the elementary operation.

## Reading expressions

```python
z = einx.dot("a [b], [b] c -> a c", x, y)
```

How to read this:
- The full operation consumes tensors shaped like `a b` and `b c` and returns `a c`.
- The elementary operation is `dot` over the bracketed axis `[b]`.
- The unbracketed axes `a` and `c` define the vectorization, which corresponds to matrix multiplication.

Elementwise operations use the same notation without bracketed axes because the elementary operation acts on scalar values:

```python
z = einx.add("a b, a b -> a b", x, y)
z = einx.add("a b, b c -> a b c", x, y)
z = einx.multiply("i, j -> i j", x, y)
```

That same vectorization pattern works across different elementary operations. If the expression makes sense for one scalar op, it often transfers directly to others.

## Reductions

Reduction operations mark the reduced axes with brackets:

```python
y = einx.sum("a [b] c -> a c", x)
y = einx.mean("b [h w] c -> b c", x)
```

For many reductions, the output expression can be omitted because `einx` can infer it by removing the bracketed axes.

## Built-in operations vs custom operations

The docs describe two broad ways to work with `einx`:
- Use a built-in operation from the public API such as `id`, `dot`, `add`, `mean`, or `get_at`.
- Adapt a custom operation to `einx` notation when no built-in operation matches the intent.

Start with built-ins first. They make code easier to read and align better with the docs and examples.

## Backends

The same notation is designed to work across multiple tensor backends, including NumPy, PyTorch, JAX, and TensorFlow.

## Source

Distilled from:
- https://einx.readthedocs.io/en/latest/gettingstarted/basics.html
