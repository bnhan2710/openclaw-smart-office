#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";

import { gogBinary, gogEnv } from "../lib/gog.js";
import { printEnvelope, printError } from "../lib/response.js";

const SKILL = "calendar-management";
const DEFAULT_CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID?.trim() || "primary";
const { values: args } = parseArgs({
  options: {
    title: { type: "string" },
    start: { type: "string" },
    end: { type: "string" },
    description: { type: "string", default: "" },
    attendees: { type: "string", default: "" },
    "calendar-id": { type: "string", default: DEFAULT_CALENDAR_ID },
    confirmed: { type: "boolean" },
    "dry-run": { type: "boolean" },
    help: { type: "boolean", short: "h" },
  },
  strict: false,
});

function parseAttendees(attendees) {
  return attendees.split(",").map((attendee) => attendee.trim()).filter(Boolean);
}

function eventPreview() {
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
  return {
    title: args.title,
    start: args.start,
    end: args.end,
    description: args.description,
    attendees: parseAttendees(args.attendees),
    calendar_id: args["calendar-id"]?.trim() || DEFAULT_CALENDAR_ID,
  };
}

function commandArgs(event) {
  return [
    "calendar", "create", event.calendar_id,
    "--summary", event.title,
    "--from", event.start,
    "--to", event.end,
    "--description", event.description,
    ...(event.attendees.length ? ["--attendees", event.attendees.join(",")] : []),
    ...(args["dry-run"] ? ["--dry-run"] : []),
    "--json",
    "--no-input",
  ];
}

function main() {
  if (args.help) {
    console.log("Usage: node scripts/calendar-management.js --title text --start ISO --end ISO [--calendar-id primary] [--description text] [--attendees csv] [--confirmed] [--dry-run]");
    return;
  }
  try {
    const event = eventPreview();
    const gogArgs = commandArgs(event);
    if (!args.confirmed) {
      printEnvelope(SKILL, {
        action: "preview",
        requires_confirmation: true,
        event,
        command: [gogBinary(), ...gogArgs],
      });
      return;
    }
    const result = spawnSync(gogBinary(), gogArgs, { encoding: "utf8", env: gogEnv() });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(result.stderr.trim() || "gog calendar command failed");
    printEnvelope(SKILL, { action: args["dry-run"] ? "dry-run" : "created", result: JSON.parse(result.stdout) });
  } catch (error) {
    printError(SKILL, error);
    process.exitCode = 1;
  }
}

main();
