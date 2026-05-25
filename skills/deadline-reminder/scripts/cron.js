#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";

import { LEGACY_DEADLINES_PATH } from "../../../lib/config.js";
import { createTask, getDatabase, logAudit, migrateLegacyDeadlines } from "../../../lib/database.js";
import { daysUntil } from "../../../lib/dates.js";
import { printEnvelope, printError } from "../../../lib/response.js";

const SKILL = "deadline-reminder";
const reminderDays = (process.env.REMINDER_DAYS_BEFORE ?? "3,1").split(",").map(Number);
const { values: args } = parseArgs({
  options: {
    add: { type: "boolean" }, remove: { type: "boolean" }, list: { type: "boolean" }, check: { type: "boolean" },
    daemon: { type: "boolean" }, notify: { type: "boolean" }, "import-json": { type: "boolean" }, "export-json": { type: "boolean" },
    title: { type: "string" }, deadline: { type: "string" }, ref: { type: "string" }, priority: { type: "string", default: "medium" },
    id: { type: "string" }, days: { type: "string", default: "30" }, file: { type: "string" }, help: { type: "boolean" },
  },
  strict: false,
});

function upcomingTasks(db, horizon = Number.parseInt(args.days ?? "30", 10)) {
  return db.prepare("SELECT id, title, deadline, priority, reference, status FROM tasks WHERE deadline IS NOT NULL AND status NOT IN ('completed', 'removed')")
    .all()
    .map((task) => ({ ...task, daysLeft: daysUntil(task.deadline) }))
    .filter((task) => task.daysLeft <= horizon)
    .sort((left, right) => left.daysLeft - right.daysLeft);
}

function reminderText(tasks) {
  return [
    "NHẮC NHỞ DEADLINE - Smart Office",
    ...tasks.map((task) => `${task.daysLeft < 0 ? "QUÁ HẠN" : `CÒN ${task.daysLeft} NGÀY`}: ${task.title}${task.reference ? ` [${task.reference}]` : ""} (${task.deadline})`),
  ].join("\n");
}

function configuredChannels() {
  return [
    ...(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID ? ["telegram"] : []),
    ...(process.env.SMTP_HOST && process.env.NOTIFY_EMAIL ? ["email"] : []),
  ];
}

async function sendNotification(channel, text) {
  if (channel === "telegram") {
    const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text }),
    });
    if (!response.ok) throw new Error("Telegram notification failed");
    return;
  }
  if (channel === "email") {
    const { default: nodemailer } = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number.parseInt(process.env.SMTP_PORT ?? "587", 10),
      secure: process.env.SMTP_PORT === "465",
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    await transporter.sendMail({ from: process.env.SMTP_USER, to: process.env.NOTIFY_EMAIL, subject: "Nhắc nhở Deadline - Smart Office", text });
  }
}

async function checkAndMaybeNotify(db, notify) {
  const tasks = upcomingTasks(db, Math.max(...reminderDays, 1)).filter((task) => task.daysLeft < 0 || task.daysLeft <= 1 || reminderDays.includes(task.daysLeft));
  if (!notify || tasks.length === 0) return { tasks, message: tasks.length ? reminderText(tasks) : "Không có deadline cần nhắc.", channels: [] };
  const today = new Date().toISOString().slice(0, 10);
  const configured = configuredChannels();
  const channels = [];
  for (const channel of configured) {
    const unsent = tasks.filter((task) => !db.prepare("SELECT 1 FROM reminders WHERE task_id = ? AND channel = ? AND reminder_key = ?").get(task.id, channel, `${today}:${task.daysLeft}`));
    if (unsent.length === 0) continue;
    await sendNotification(channel, reminderText(unsent));
    db.transaction(() => {
      for (const task of unsent) {
        db.prepare("INSERT INTO reminders (id, task_id, channel, reminder_key, sent_at) VALUES (?, ?, ?, ?, ?)")
          .run(`rem-${randomUUID()}`, task.id, channel, `${today}:${task.daysLeft}`, new Date().toISOString());
      }
      logAudit(db, { action: "reminder.notify", entityType: "task", details: { count: unsent.length, channel } });
    })();
    channels.push(channel);
  }
  if (configured.length > 0 && channels.length === 0) return { tasks, message: "Các nhắc nhở hôm nay đã được gửi.", channels };
  return { tasks, message: reminderText(tasks), channels };
}

function startDaemon() {
  const [hours, minutes] = (process.env.REMINDER_TIME ?? "08:00").split(":").map(Number);
  const schedule = () => {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    setTimeout(async () => {
      const db = getDatabase();
      try { await checkAndMaybeNotify(db, true); } finally { db.close(); schedule(); }
    }, next.getTime() - now.getTime());
  };
  schedule();
  return { status: "running", reminder_time: process.env.REMINDER_TIME ?? "08:00" };
}

async function main() {
  if (args.help) {
    console.log("Usage: cron.js --add ... | --list | --check [--notify] | --import-json [--file path] | --export-json [--file path] | --daemon");
    return;
  }
  if (args.daemon) {
    printEnvelope(SKILL, startDaemon());
    return;
  }
  const db = getDatabase();
  try {
    let result;
    if (args.add) result = createTask(db, { title: args.title, deadline: args.deadline, reference: args.ref, priority: args.priority });
    else if (args.remove && args.id) {
      db.transaction(() => {
        db.prepare("UPDATE tasks SET status = 'removed' WHERE id = ?").run(args.id);
        logAudit(db, { action: "task.remove", entityType: "task", entityId: args.id });
      })();
      result = { id: args.id, status: "removed" };
    } else if (args.list) result = upcomingTasks(db);
    else if (args.check) result = await checkAndMaybeNotify(db, args.notify);
    else if (args["import-json"]) result = { imported: migrateLegacyDeadlines(db, args.file ?? LEGACY_DEADLINES_PATH) };
    else if (args["export-json"]) {
      const filePath = path.resolve(args.file ?? "./data/deadlines-export.json");
      const data = db.prepare("SELECT id, title, deadline, reference AS ref, priority, status, created_at AS createdAt FROM tasks WHERE deadline IS NOT NULL").all();
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
      result = { file: filePath, exported: data.length };
    } else throw new Error("Choose a deadline command");
    printEnvelope(SKILL, result);
  } catch (error) {
    printError(SKILL, error);
    process.exitCode = 1;
  } finally {
    db.close();
  }
}

main();
