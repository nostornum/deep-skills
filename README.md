# deep-skills

A curated collection of [Agent Skills](https://agentskills.io) for **deep-learning
and Python projects**, gathered in one place.

Some skills are original, some are inspired by or adapted from existing skills,
and some are copies kept here so a project can pull everything from a single
source. Every skill follows the [Agent Skills specification](https://agentskills.io/specification),
so they work with any compatible agent — Claude Code, OpenAI Codex, GitHub
Copilot, Cursor, and others.

## Skills

### Python tooling

| Skill | What it does |
|-------|--------------|
| [`uv`](skills/uv) | Manage Python packages, projects, scripts, and tools with uv. |
| [`ruff`](skills/ruff) | Lint and format Python with ruff — the fast Flake8/Black/isort replacement. |
| [`ty`](skills/ty) | Type-check Python with ty — the fast mypy/Pyright replacement. |
| [`tyro`](skills/tyro) | Generate typed Python CLIs directly from type hints. |

### Libraries

| Skill | What it does |
|-------|--------------|
| [`polars`](skills/polars) | Fast in-memory DataFrames: expressions, lazy evaluation, pandas migration. |
| [`msgspec`](skills/msgspec) | Fast, validated serialization with `Struct` and JSON/MessagePack/YAML/TOML codecs. |
| [`einx`](skills/einx) | Named-axis tensor expressions for reshape/reduction/gather logic. |

### Workflows

| Skill | What it does |
|-------|--------------|
| [`jupyter`](skills/jupyter) | Create and structure Jupyter notebooks with a consistent layout and Ruff validation. |
| [`research`](skills/research) | Manage and query a repository-local library of papers and reference implementations. |
| [`skillup`](skills/skillup) | Author new Agent Skills that follow the specification. |
| [`lefthook`](skills/lefthook) | Configure and manage git hooks with lefthook. |

## Getting started

### With `npx skills` (any agent)

The [`skills` CLI](https://github.com/vercel-labs/skills) installs skills from
this repo into your project. It auto-detects which coding agents you have
installed.

```bash
# Pick skills interactively
npx skills add nostornum/deep-skills

# Install every skill
npx skills add nostornum/deep-skills --all

# Install a single skill
npx skills add https://github.com/nostornum/deep-skills/tree/main/skills/polars
```

Skills land in your agent's skills directory (e.g. `.claude/skills/` or
`.agents/skills/`).

### As a Claude Code plugin

This repo doubles as a Claude Code plugin marketplace. Add the marketplace and
install the bundle in two commands:

```
/plugin marketplace add nostornum/deep-skills
/plugin install deep-skills@deep-skills
```

All eleven skills become available in that session.

### Manually

Copy any skill directory into your agent's skills folder:

```bash
cp -r skills/polars /path/to/project/.claude/skills/
```

## Add skills to your own project

Any repository with a top-level `skills/` folder is consumable by `npx skills`.
To start your own collection:

```bash
# Scaffold a new skill
npx skills init my-skill

# Install skills from any repo into your project
npx skills add <owner>/<repo>
```

For a guided walkthrough of writing a skill, use the [`skillup`](skills/skillup)
skill in this collection.

## Repository layout

```
deep-skills/
├── .claude-plugin/
│   ├── plugin.json        # Claude Code plugin manifest
│   └── marketplace.json   # Claude Code marketplace manifest
├── skills/
│   └── <skill-name>/
│       ├── SKILL.md       # Required: metadata + instructions
│       └── references/    # Optional: progressive-disclosure docs
├── scripts/               # Skill-validation script (run by the pre-commit hook)
├── lefthook.yml           # Git hooks: commit-msg + pre-commit
├── commitlint.config.ts   # Conventional Commits ruleset
├── LICENSE
└── README.md
```

Each `SKILL.md` carries YAML frontmatter (`name`, `description`, `license`,
`metadata`) followed by Markdown instructions, per the
[specification](https://agentskills.io/specification).

## Contributing

### Setup

Install the dev tooling once — this also wires the git hooks via lefthook:

```bash
pnpm install
```

### Commits

Commits follow [Conventional Commits](https://www.conventionalcommits.org):
`type(scope): subject` (e.g. `feat(polars): add streaming section`). The scope
is optional; a skill name is the suggested scope. A `commit-msg` hook
(commitlint) rejects messages that don't conform.

Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`,
`build`, `ci`, `chore`, `revert`.

### Adding or changing a skill

1. Create `skills/<skill-name>/SKILL.md` — the `name` field must match the
   directory name.
2. Keep `SKILL.md` focused; move long reference material into `references/`.
3. Whenever a skill is added or modified, a `pre-commit` hook validates it with
   `skills-ref`. Run the same check across every skill manually with:

   ```bash
   pnpm skillcheck
   ```

## License

[MIT](LICENSE).
