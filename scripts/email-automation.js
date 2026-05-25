#!/usr/bin/env node
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";

import { printEnvelope, printError } from "../lib/response.js";

const SKILL = "email-automation";
const { values: args } = parseArgs({
  options: {
    to: { type: "string" },
    subject: { type: "string" },
    body: { type: "string" },
    confirmed: { type: "boolean" },
    "dry-run": { type: "boolean" },
    help: { type: "boolean", short: "h" },
  },
  strict: false,
});

function commandArgs() {
  if (!args.to || !args.subject || !args.body) {
    throw new Error("--to, --subject and --body are required");
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(args.to)) {
    throw new Error("Recipient email is invalid");
  }
  return [
    "gmail", "draft", "create",
    "--to", args.to,
    "--subject", args.subject,
    "--body", args.body,
    ...(args["dry-run"] ? ["--dry-run"] : []),
    "--json",
    "--no-input",
  ];
}

function gogBinary() {
  const dockerBinary = "/home/node/.openclaw/bin/gog";
  return fs.existsSync(dockerBinary) ? dockerBinary : "gog";
}

function main() {
  if (args.help) {
    console.log("Usage: node scripts/email-automation.js --to email --subject text --body text [--confirmed] [--dry-run]");
    return;
  }
  try {
    const gogArgs = commandArgs();
    if (!args.confirmed) {
      printEnvelope(SKILL, { action: "preview-draft", requires_confirmation: true, command: [gogBinary(), ...gogArgs] });
      return;
    }
    const result = spawnSync(gogBinary(), gogArgs, { encoding: "utf8" });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(result.stderr.trim() || "gog Gmail draft command failed");
    printEnvelope(SKILL, { action: args["dry-run"] ? "dry-run" : "draft-created", result: JSON.parse(result.stdout) });
  } catch (error) {
    printError(SKILL, error);
    process.exitCode = 1;
  }
}

main();
