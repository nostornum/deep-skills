# Ingesting a New Paper

Use this workflow when the user provides a paper PDF, arXiv URL, technique name,
or reference implementation and asks to add it to the research library.

1. Resolve the paper identity from local sources first: PDF metadata, first page
   text, or user-provided URL. Use web only when the user asks or local metadata
   is insufficient.
2. Explicitly ask the user whether there is an official or preferred reference
   implementation to clone unless the user already provided one or explicitly
   says to skip code. Do this even when the PDF, arXiv page, or local metadata
   does not mention a repository; absence of an in-paper repo link is not enough
   to conclude that no implementation exists.
3. Create or update `research/INDEX.md` and one paper folder under
   `research/papers/`.
4. Name paper folders with semantic slugs made only of lowercase letters and
   dashes, such as `coredi`, `attnres`, or `dct-patch-embed`. Store arXiv IDs,
   years, versions, and commit hashes inside `notes.md`, not in folder names.
5. Put the main artifacts in the paper folder:
   - `paper.pdf` for the PDF, copied or symlinked according to the user's stated
     preference
   - `paper.txt` extracted with `pdftotext` when possible
   - `notes.md` for the durable paper-only summary
   - `repo/` only when a usable reference implementation is cloned
6. In `notes.md`, capture only paper-internal context:
   - title, authors, arXiv or publication URL, local PDF path, code repo status
   - main idea in plain language
   - implementation-relevant equations, tensor shapes, losses, modules, training
     constraints, and hyperparameter clues
   - reproducibility details, paper-provided implementation notes, ablations,
     and cautions about missing details or unavailable code
   Do not include project-specific mappings, local source paths, project-specific
   recommendations, or "why it matters for the project" commentary in `notes.md`.
   Keep those comparisons for query-time answers after inspecting both the paper
   notes and the project source.
7. In `research/INDEX.md`, add semantic lookup phrases rather than strict tags,
   so fuzzy mentions and partial technique names can resolve to the right paper.
   Index entries should describe the paper's concepts neutrally, without
   project-specific mapping or affected-file guidance.
8. Verify the folder is ignored by Git with `git check-ignore -v`, and confirm
   `git status --short` does not list research artifacts unless the user
   explicitly wants them tracked.
