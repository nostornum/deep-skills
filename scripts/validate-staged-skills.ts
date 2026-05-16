#!/usr/bin/env ts-node
// Validates Agent Skills with `skills-ref`. Run by the lefthook pre-commit hook
// (receives staged skill files as args) or manually via `pnpm skillcheck`.
import { existsSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

const args: string[] = process.argv.slice(2);

function skillsFromPaths(paths: string[]): string[] {
  const names = new Set<string>();
  for (const p of paths) {
    const match = p.match(/^skills\/([^/]+)\//);
    if (match) names.add(match[1]);
  }
  return [...names];
}

let skillNames: string[];
if (args.includes("--all")) {
  skillNames = readdirSync("skills", { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
} else if (args.length > 0) {
  skillNames = skillsFromPaths(args);
} else {
  const staged = spawnSync(
    "git",
    ["diff", "--cached", "--name-only", "--diff-filter=ACMR"],
    { encoding: "utf8" },
  );
  skillNames = skillsFromPaths(staged.stdout.split("\n").filter(Boolean));
}

// Skip skills that were fully deleted.
const targets = skillNames
  .sort()
  .filter((name) => existsSync(`skills/${name}/SKILL.md`));

if (targets.length === 0) {
  console.log("No skills to validate.");
  process.exit(0);
}

let failed = false;
for (const name of targets) {
  const result = spawnSync(
    "pnpm",
    ["exec", "skills-ref", "validate", `./skills/${name}`],
    { stdio: "inherit" },
  );
  if (result.status !== 0) failed = true;
}

process.exit(failed ? 1 : 0);
