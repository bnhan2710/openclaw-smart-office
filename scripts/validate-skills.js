#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = path.resolve("skills");
const errors = [];
const skills = fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();

for (const name of skills) {
  const directory = path.join(root, name);
  const skillPath = path.join(directory, "SKILL.md");
  const packagePath = path.join(directory, "package.json");
  if (!fs.existsSync(skillPath)) errors.push(`${name}: missing SKILL.md`);
  if (!fs.existsSync(packagePath)) errors.push(`${name}: missing package.json`);
  if (fs.existsSync(skillPath)) {
    const contents = fs.readFileSync(skillPath, "utf8");
    if (!contents.startsWith("---\n") || !contents.includes(`name: ${name}`)) errors.push(`${name}: invalid frontmatter name`);
  }
  if (fs.existsSync(packagePath)) {
    const manifest = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    if (manifest.name !== name) errors.push(`${name}: package name mismatch`);
    if (!manifest.scripts || Object.keys(manifest.scripts).length === 0) errors.push(`${name}: no CLI script declared`);
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`Validated ${skills.length} OpenClaw skills.`);
