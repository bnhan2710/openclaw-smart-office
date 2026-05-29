#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";

import { gogBinary, gogEnv } from "../lib/gog.js";
import { printEnvelope, printError } from "../lib/response.js";

const SKILL = "email-automation";
const { values: args } = parseArgs({
  options: {
    to: { type: "string" },
    subject: { type: "string" },
    body: { type: "string" },
    confirmed: { type: "boolean" },
    "dry-run": { type: "boolean" },
    smtp: { type: "boolean" },
    help: { type: "boolean", short: "h" },
  },
  strict: false,
});

function isValidEmail(email) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

function normalizePlainText(value) {
  return String(value ?? "")
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\r\n/g, "\n");
}

function emailPreview({ requireRecipient = false } = {}) {
  if (!args.subject || !args.body) {
    throw new Error("--subject and --body are required");
  }
  const to = args.to?.trim() || null;
  if (requireRecipient && !to) {
    throw new Error("--to is required before creating or sending email");
  }
  if (to && !isValidEmail(to)) {
    throw new Error("Recipient email is invalid");
  }
  return {
    to,
    subject: args.subject,
    body: normalizePlainText(args.body),
  };
}

function commandArgs(email) {
  if (!email.to) {
    throw new Error("--to is required before creating Gmail draft");
  }
  return [
    "gmail", "draft", "create",
    "--to", email.to,
    "--subject", email.subject,
    "--body", email.body,
    ...(args["dry-run"] ? ["--dry-run"] : []),
    "--json",
    "--no-input",
  ];
}

function smtpConfig() {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  if (!host || !user || !pass) {
    throw new Error("SMTP_HOST, SMTP_USER and SMTP_PASS are required for SMTP sending");
  }
  const port = Number.parseInt(process.env.SMTP_PORT ?? "587", 10);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error("SMTP_PORT is invalid");
  }
  return {
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  };
}

async function sendSmtpMail() {
  const email = emailPreview({ requireRecipient: true });
  const config = smtpConfig();
  if (args["dry-run"]) {
    printEnvelope(SKILL, {
      action: "smtp-dry-run",
      to: email.to,
      subject: email.subject,
      from: config.auth.user,
    });
    return;
  }
  const { default: nodemailer } = await import("nodemailer");
  const transporter = nodemailer.createTransport(config);
  const result = await transporter.sendMail({
    from: config.auth.user,
    to: email.to,
    subject: email.subject,
    text: email.body,
    html: undefined,
  });
  printEnvelope(SKILL, {
    action: "smtp-sent",
    to: email.to,
    subject: email.subject,
    from: config.auth.user,
    messageId: result.messageId,
  });
}

async function main() {
  if (args.help) {
    console.log("Usage: node scripts/email-automation.js --to email --subject text --body text [--confirmed] [--dry-run] [--smtp]");
    return;
  }
  try {
    if (args.smtp) {
      const email = emailPreview();
      if (!args.confirmed) {
        printEnvelope(SKILL, {
          action: "preview-smtp",
          requires_confirmation: true,
          ready_for_confirmation: Boolean(email.to),
          missing: email.to ? [] : ["to"],
          email,
        });
        return;
      }
      await sendSmtpMail();
      return;
    }
    const email = emailPreview();
    const gogArgs = email.to ? commandArgs(email) : null;
    if (!args.confirmed) {
      printEnvelope(SKILL, {
        action: "preview-draft",
        requires_confirmation: true,
        ready_for_confirmation: Boolean(email.to),
        missing: email.to ? [] : ["to"],
        email,
        command: gogArgs ? [gogBinary(), ...gogArgs] : null,
      });
      return;
    }
    if (!gogArgs) {
      throw new Error("--to is required before creating Gmail draft");
    }
    const result = spawnSync(gogBinary(), gogArgs, { encoding: "utf8", env: gogEnv() });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(result.stderr.trim() || "gog Gmail draft command failed");
    printEnvelope(SKILL, { action: args["dry-run"] ? "dry-run" : "draft-created", result: JSON.parse(result.stdout) });
  } catch (error) {
    printError(SKILL, error);
    process.exitCode = 1;
  }
}

main();
