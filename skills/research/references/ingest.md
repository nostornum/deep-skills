# Ingesting a New Paper

Use this workflow when the user provides a paper PDF, arXiv URL, technique name,
or reference implementation and asks to add it to the research library.

## Resolve Paper Identity

Start with local sources: PDF metadata, first page text, or a user-provided URL.
Fall back to the web only when the user asks or local metadata is insufficient.

## Ask About a Reference Implementation

Always ask the user whether there is an official or preferred reference
implementation to clone, unless the user already provided one or explicitly says
to skip code. Do this even when the PDF, arXiv page, or local metadata does not
mention a repository — absence of an in-paper repo link is not enough to conclude
that no implementation exists.

## Create the Folder Structure

Create or update `research/INDEX.md` and one paper folder under `research/papers/`.

Name paper folders with semantic slugs made only of lowercase letters and dashes,
such as `coredi`, `attnres`, or `dct-patch-embed`. Store arXiv IDs, years,
versions, and commit hashes inside `notes.md`, not in folder names.

Put the main artifacts in the paper folder:

- `paper.pdf` — the PDF, copied or symlinked according to the user's stated preference
- `paper.txt` — extracted with `pdftotext` when possible
- `notes.md` — the durable paper-only summary
- `repo/` — only when a usable reference implementation is cloned

## Write notes.md

Capture only paper-internal context:

- Title, authors, arXiv or publication URL, local PDF path, code repo status
- Main idea in plain language
- Implementation-relevant equations, tensor shapes, losses, modules, training
  constraints, and hyperparameter clues
- Reproducibility details, paper-provided implementation notes, ablations,
  and cautions about missing details or unavailable code

Do not include project-specific mappings, local source paths, project-specific
recommendations, or "why it matters for the project" commentary. Keep those
comparisons for query-time answers after inspecting both the paper notes and the
project source.

## Update research/INDEX.md

Add semantic lookup phrases rather than strict tags, so fuzzy mentions and partial
technique names can resolve to the right paper. Index entries should describe the
paper's concepts neutrally, without project-specific mapping or affected-file
guidance.

## Verify Git Ignores

Run `git check-ignore -v` on the new folder and confirm `git status --short` does
not list research artifacts unless the user explicitly wants them tracked.
