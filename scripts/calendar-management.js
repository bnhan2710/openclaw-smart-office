#!/usr/bin/env node
import fs from "node:fs";
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
    "events-json": { type: "string" },
    "events-file": { type: "string" },
    "calendar-id": { type: "string", default: DEFAULT_CALENDAR_ID },
    confirmed: { type: "boolean" },
    "dry-run": { type: "boolean" },
    help: { type: "boolean", short: "h" },
  },
  strict: false,
});

function parseAttendees(attendees) {
  if (Array.isArray(attendees)) return attendees.map((attendee) => String(attendee).trim()).filter(Boolean);
  return String(attendees ?? "").split(",").map((attendee) => attendee.trim()).filter(Boolean);
}

function validateEvent(input) {
  const event = {
    title: input.title,
    start: input.start,
    end: input.end,
    description: input.description ?? "",
    attendees: parseAttendees(input.attendees),
    calendar_id: input.calendar_id ?? input["calendar-id"] ?? args["calendar-id"]?.trim() ?? DEFAULT_CALENDAR_ID,
  };
  if (!event.title || !event.start || !event.end) {
    throw new Error("--title, --start and --end are required");
  }
  const start = Date.parse(event.start);
  const end = Date.parse(event.end);
  if (Number.isNaN(start) || Number.isNaN(end)) {
    throw new Error("--start and --end must be valid ISO date times");
  }
  if (end <= start) {
    throw new Error("--end must be after --start");
  }
  return event;
}

function eventPreview() {
  return validateEvent(args);
}

function loadBatchEvents() {
  const source = args["events-file"]
    ? fs.readFileSync(args["events-file"], "utf8")
    : args["events-json"];
  if (!source) return null;
  const parsed = JSON.parse(source.replace(/^\uFEFF/, ""));
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("--events-json/--events-file must contain a non-empty JSON array");
  }
  return parsed.map((event, index) => {
    try {
      return validateEvent(event);
    } catch (error) {
      throw new Error(`event ${index + 1}: ${error.message}`);
    }
  });
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
    console.log("Usage: node scripts/calendar-management.js --title text --start ISO --end ISO [--calendar-id primary] [--description text] [--attendees csv] [--confirmed] [--dry-run]\n       node scripts/calendar-management.js --events-json '[{\"title\":\"...\",\"start\":\"...\",\"end\":\"...\"}]' [--confirmed] [--dry-run]");
    return;
  }
  try {
    const batchEvents = loadBatchEvents();
    const events = batchEvents ?? [eventPreview()];
    const commands = events.map((event) => [gogBinary(), ...commandArgs(event)]);
    if (!args.confirmed) {
      printEnvelope(SKILL, {
        action: batchEvents ? "preview-batch" : "preview",
        requires_confirmation: true,
        ...(batchEvents ? { events, count: events.length, commands } : { event: events[0], command: commands[0] }),
      });
      return;
    }
    const results = [];
    for (let index = 0; index < events.length; index += 1) {
      const result = spawnSync(gogBinary(), commandArgs(events[index]), { encoding: "utf8", env: gogEnv() });
      if (result.error) throw result.error;
      if (result.status !== 0) throw new Error(`event ${index + 1}: ${result.stderr.trim() || "gog calendar command failed"}`);
      results.push(JSON.parse(result.stdout));
    }
    printEnvelope(SKILL, {
      action: args["dry-run"] ? (batchEvents ? "dry-run-batch" : "dry-run") : (batchEvents ? "created-batch" : "created"),
      count: results.length,
      results: batchEvents ? results : undefined,
      result: batchEvents ? undefined : results[0],
    });
  } catch (error) {
    printError(SKILL, error);
    process.exitCode = 1;
  }
}

main();
