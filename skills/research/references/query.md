# Querying the Research Index

Use this command when the user asks about an indexed paper, a named technique,
a fuzzy research concept, or whether the project satisfies constraints from a paper.

## Paper or Technique Lookup

For named papers, technique names, aliases, or fuzzy research concepts, start
with `research/INDEX.md`. Use the semantic descriptions and aliases there to
identify candidate papers.

After choosing a candidate, read that paper's `notes.md` before loading larger
artifacts. Answer from the notes when they are sufficient, and mention when the
indexed context is shallow.

## Deeper Paper Verification

Use `paper.txt` only when the notes are not enough: exact equations, ablation
details, implementation constraints, or wording-sensitive claims.

Inspect `paper.pdf` only when figures, tables, formatting, or text extraction
quality matter.

## Reference Implementation Questions

If a paper has `repo/` and the user asks code or technical questions, explicitly
ask whether you should search the paper codebase. Treat code under `research/`
as read-only reference context.

When the user asks to port code or ideas, adapt them into your project's existing
style. Never import from `research/`.

## Project implementation comparisons

When comparing the project to a paper, ground claims in both sides. Cite the
relevant paper notes or text section, inspect the project source paths that
implement comparable behavior, and distinguish exact matches, partial matches,
and missing constraints.

## Answer Shape

Summarize the paper or technique's main idea first. Then give the implementation
consequences for the project when relevant. Mention when further paper reading or
code inspection would be needed to answer more confidently.
