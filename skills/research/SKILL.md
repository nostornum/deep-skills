---
name: research
description: "Use when working with a repository-local research library: ingesting a new research paper, PDF, arXiv link, or reference implementation into research/; or answering, locating, summarizing, comparing, or implementation-checking a query against research/INDEX.md and the per-paper notes. Trigger when the user mentions adding a paper, ingesting a paper, updating paper notes, checking the research index, asking what a named technique/paper means, or asking whether project code matches constraints from an indexed paper."
license: MIT
metadata:
  version: "1.0"
---

# Research Library

Manage and query the repository-local `research/` library of papers and reference implementations.

## Quick start

- **Add a paper**: "ingest arxiv.org/abs/2410.xxxxx" or "add this PDF to research"
- **Look something up**: "what does the paper say about CFG scaling?" or "does our DiT match the paper's attention?"

## Instructions

### Ingesting a paper or reference implementation

Read [references/ingest.md](references/ingest.md) for the full workflow.

### Querying an indexed paper or technique

Read [references/query.md](references/query.md) for the full workflow.

## Best practices

- `research/` is project context only — your project's package code must never import from it.
- When reading paper notes, prefer `notes.md` first, then `paper.txt`, and only open the PDF directly when exact equations, figures, or layout-sensitive details matter.
- Reference repos under a paper's `repo/` directory are read-only context; port ideas into your project's style rather than importing from them.
