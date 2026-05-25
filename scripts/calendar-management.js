#!/usr/bin/env node
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";

import { printEnvelope, printError } from "../lib/response.js";

const SKILL = "calendar-management";
const { values: args } = parseArgs({
  options: {
    title: { type: "string" },
    start: { type: "string" },
    end: { type: "string" },
    description: { type: "string", default: "" },
    attendees: { type: "string", default: "" },
    "calendar-id": { type: "string", default: "primary" },
    confirmed: { type: "boolean" },
    "dry-run": { type: "boolean" },
    help: { type: "boolean", short: "h" },
  },
  strict: false,
});

function commandArgs() {
  if (!args.title || !args.start || !args.end) {
    throw new Error("--title, --start and --end are required");
  }
  const start = Date.parse(args.start);
  const end = Date.parse(args.end);
  if (Number.isNaN(start) || Number.isNaN(end)) {
    throw new Error("--start and --end must be valid ISO date times");
  }
  if (end <= start) {
    throw new Error("--end must be after --start");
  }
  return [
    "calendar", "create", args["calendar-id"],
    "--summary", args.title,
    "--from", args.start,
    "--to", args.end,
    "--description", args.description,
    ...(args.attendees ? ["--attendees", args.attendees] : []),
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
    console.log("Usage: node scripts/calendar-management.js --title text --start ISO --end ISO [--calendar-id primary] [--description text] [--attendees csv] [--confirmed] [--dry-run]");
    return;
  }
  try {
    const gogArgs = commandArgs();
    if (!args.confirmed) {
      printEnvelope(SKILL, { action: "preview", requires_confirmation: true, command: [gogBinary(), ...gogArgs] });
      return;
    }
    const result = spawnSync(gogBinary(), gogArgs, { encoding: "utf8" });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(result.stderr.trim() || "gog calendar command failed");
    printEnvelope(SKILL, { action: args["dry-run"] ? "dry-run" : "created", result: JSON.parse(result.stdout) });
  } catch (error) {
    printError(SKILL, error);
    process.exitCode = 1;
  }
}

main();
