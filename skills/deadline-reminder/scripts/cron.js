#!/usr/bin/env node
/**
 * cron.js — Theo dõi và nhắc nhở hạn xử lý công văn/nhiệm vụ
 * Theo dõi deadline
 * Gửi thông báo nhắc nhở tự động
 */

import fs from "fs";
import path from "path";
import { parseArgs } from "util";

// ── Config ────────────────────────────────────────────────────────────────────
const CONFIG = {
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID,
  },
  smtp: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT ?? "587"),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    notifyEmail: process.env.NOTIFY_EMAIL,
  },
  reminderDaysBefore: (process.env.REMINDER_DAYS_BEFORE ?? "3,1")
    .split(",")
    .map(Number),
  reminderTime: process.env.REMINDER_TIME ?? "08:00",
  deadlinesFile: path.resolve(process.env.DEADLINES_FILE ?? "./data/deadlines.json"),
  timezone: "Asia/Ho_Chi_Minh",
};

// ── CLI args ──────────────────────────────────────────────────────────────────
const { values: args } = parseArgs({
  options: {
    add: { type: "boolean" },
    remove: { type: "boolean" },
    list: { type: "boolean" },
    check: { type: "boolean" },
    daemon: { type: "boolean" },
    notify: { type: "boolean" },
    title: { type: "string" },
    deadline: { type: "string" },
    ref: { type: "string" },
    priority: { type: "string", default: "medium" },
    id: { type: "string" },
    days: { type: "string", default: "30" },
    help: { type: "boolean", short: "h" },
  },
  strict: false,
});

if (args.help) {
  console.log(`
Sử dụng:
  node cron.js --add --title "..." --deadline "YYYY-MM-DD" [--ref "..."] [--priority high|medium|low]
  node cron.js --remove --id <id>
  node cron.js --list [--days 7]
  node cron.js --check [--notify]
  node cron.js --daemon

Biến môi trường:
  TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID
  SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / NOTIFY_EMAIL
  REMINDER_DAYS_BEFORE   (mặc định: 3,1)
  REMINDER_TIME          (mặc định: 08:00)
  DEADLINES_FILE         (mặc định: ./data/deadlines.json)
`);
  process.exit(0);
}

// ── Storage ───────────────────────────────────────────────────────────────────
function loadDeadlines() {
  if (!fs.existsSync(CONFIG.deadlinesFile)) return [];
  return JSON.parse(fs.readFileSync(CONFIG.deadlinesFile, "utf8"));
}

function saveDeadlines(deadlines) {
  fs.mkdirSync(path.dirname(CONFIG.deadlinesFile), { recursive: true });
  fs.writeFileSync(CONFIG.deadlinesFile, JSON.stringify(deadlines, null, 2), "utf8");
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ── Deadline helpers ──────────────────────────────────────────────────────────
function daysUntil(dateStr) {
  const deadline = new Date(dateStr);
  deadline.setHours(23, 59, 59, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((deadline - today) / (1000 * 60 * 60 * 24));
}

function urgencyEmoji(days, priority) {
  if (days < 0) return "🔴";
  if (days === 0) return "🚨";
  if (days <= 1) return "🚨";
  if (days <= 3) return "⚠️";
  if (priority === "high") return "🔶";
  return "📋";
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("vi-VN");
}

// ── Notification senders ──────────────────────────────────────────────────────
async function sendTelegram(message) {
  if (!CONFIG.telegram.token || !CONFIG.telegram.chatId) {
    throw new Error("Thiếu TELEGRAM_BOT_TOKEN hoặc TELEGRAM_CHAT_ID");
  }

  const url = `https://api.telegram.org/bot${CONFIG.telegram.token}/sendMessage`;
  const body = JSON.stringify({
    chat_id: CONFIG.telegram.chatId,
    text: message,
    parse_mode: "HTML",
  });

  const { default: fetch } = await import("node-fetch").catch(async () => {
    // Node 18+ has native fetch
    return { default: globalThis.fetch };
  });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Telegram API error: ${err}`);
  }
}

async function sendEmail(subject, body) {
  const nodemailer = await import("nodemailer").catch(() => {
    throw new Error("Cần cài đặt: npm install nodemailer");
  });

  const transporter = nodemailer.default.createTransport({
    host: CONFIG.smtp.host,
    port: CONFIG.smtp.port,
    secure: CONFIG.smtp.port === 465,
    auth: { user: CONFIG.smtp.user, pass: CONFIG.smtp.pass },
  });

  await transporter.sendMail({
    from: CONFIG.smtp.user,
    to: CONFIG.smtp.notifyEmail,
    subject,
    text: body,
  });
}

// ── Notification builder ──────────────────────────────────────────────────────
function buildReminderMessage(overdue, urgent, upcoming) {
  const lines = [
    "🔔 <b>NHẮC NHỞ DEADLINE — Smart Office</b>",
    "━━━━━━━━━━━━━━━━━━━━━━━━",
  ];

  if (overdue.length) {
    lines.push("\n🔴 <b>QUÁ HẠN:</b>");
    overdue.forEach((d) => {
      const days = Math.abs(daysUntil(d.deadline));
      lines.push(`  • ${d.title}${d.ref ? ` [${d.ref}]` : ""}`);
      lines.push(`    ❌ Đã quá hạn ${days} ngày (${formatDate(d.deadline)})`);
    });
  }

  if (urgent.length) {
    lines.push("\n🚨 <b>CẦN XỬ LÝ NGAY:</b>");
    urgent.forEach((d) => {
      const days = daysUntil(d.deadline);
      lines.push(`  • ${d.title}${d.ref ? ` [${d.ref}]` : ""}`);
      lines.push(`    📅 Hạn: ${formatDate(d.deadline)} (còn ${days} ngày)`);
    });
  }

  if (upcoming.length) {
    lines.push("\n⚠️ <b>SẮP ĐẾN HẠN:</b>");
    upcoming.forEach((d) => {
      const days = daysUntil(d.deadline);
      lines.push(`  • ${d.title}${d.ref ? ` [${d.ref}]` : ""}`);
      lines.push(`    📅 Hạn: ${formatDate(d.deadline)} (còn ${days} ngày)`);
    });
  }

  const total = overdue.length + urgent.length + upcoming.length;
  lines.push(`\n📋 Tổng: ${total} việc cần chú ý`);

  return lines.join("\n");
}

// ── Commands ──────────────────────────────────────────────────────────────────
function cmdAdd() {
  if (!args.title || !args.deadline) {
    console.error("❌ Yêu cầu --title và --deadline");
    process.exit(1);
  }

  const deadlines = loadDeadlines();
  const entry = {
    id: generateId(),
    title: args.title,
    deadline: args.deadline,
    ref: args.ref ?? null,
    priority: args.priority,
    createdAt: new Date().toISOString(),
    notifiedDays: [],
  };

  deadlines.push(entry);
  saveDeadlines(deadlines);

  const days = daysUntil(args.deadline);
  console.log(
    JSON.stringify({ success: true, id: entry.id, daysLeft: days }, null, 2)
  );
  console.error(`✅ Đã thêm deadline: ${entry.title} (${formatDate(args.deadline)}, còn ${days} ngày)`);
}

function cmdRemove() {
  if (!args.id) {
    console.error("❌ Yêu cầu --id");
    process.exit(1);
  }

  const deadlines = loadDeadlines();
  const filtered = deadlines.filter((d) => d.id !== args.id);

  if (filtered.length === deadlines.length) {
    console.error(`❌ Không tìm thấy deadline với id: ${args.id}`);
    process.exit(1);
  }

  saveDeadlines(filtered);
  console.error(`✅ Đã xoá deadline ${args.id}`);
}

function cmdList() {
  const daysAhead = parseInt(args.days ?? "30");
  const deadlines = loadDeadlines();
  const now = new Date();

  const filtered = deadlines
    .map((d) => ({ ...d, daysLeft: daysUntil(d.deadline) }))
    .filter((d) => d.daysLeft <= daysAhead)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  if (!filtered.length) {
    console.log(`✅ Không có deadline nào trong ${daysAhead} ngày tới.`);
    return;
  }

  console.log(`\n📋 DEADLINE TRONG ${daysAhead} NGÀY TỚI (${filtered.length} việc)\n`);
  filtered.forEach((d) => {
    const emoji = urgencyEmoji(d.daysLeft, d.priority);
    const status = d.daysLeft < 0
      ? `QUÁ HẠN ${Math.abs(d.daysLeft)} ngày`
      : d.daysLeft === 0
      ? "HÔM NAY"
      : `còn ${d.daysLeft} ngày`;
    console.log(`${emoji} [${d.id}] ${d.title}`);
    console.log(`   📅 ${formatDate(d.deadline)} (${status})${d.ref ? ` | Ref: ${d.ref}` : ""}`);
    console.log(`   Priority: ${d.priority}`);
    console.log();
  });
}

async function cmdCheck(andNotify = false) {
  const deadlines = loadDeadlines();
  const maxReminderDays = Math.max(...CONFIG.reminderDaysBefore);

  const overdue = deadlines.filter((d) => daysUntil(d.deadline) < 0);
  const urgent = deadlines.filter((d) => {
    const days = daysUntil(d.deadline);
    return days >= 0 && days <= 1;
  });
  const upcoming = deadlines.filter((d) => {
    const days = daysUntil(d.deadline);
    return days > 1 && days <= maxReminderDays;
  });

  const shouldNotify = overdue.length + urgent.length + upcoming.length > 0;

  if (!shouldNotify) {
    console.log("✅ Không có deadline cần nhắc nhở ngay.");
    return;
  }

  const message = buildReminderMessage(overdue, urgent, upcoming);
  console.log(message.replace(/<[^>]+>/g, "")); // strip HTML for console

  if (andNotify) {
    let sent = false;
    if (CONFIG.telegram.token && CONFIG.telegram.chatId) {
      await sendTelegram(message);
      console.error("📱 Đã gửi Telegram");
      sent = true;
    }
    if (CONFIG.smtp.host && CONFIG.smtp.notifyEmail) {
      await sendEmail(
        "🔔 Nhắc nhở Deadline — Smart Office",
        message.replace(/<[^>]+>/g, "")
      );
      console.error("📧 Đã gửi Email");
      sent = true;
    }
    if (!sent) {
      console.error("⚠️  Chưa cấu hình kênh thông báo (Telegram hoặc Email)");
    }
  }
}

// ── Daemon mode ───────────────────────────────────────────────────────────────
function startDaemon() {
  const [hours, minutes] = CONFIG.reminderTime.split(":").map(Number);
  console.error(`🕐 Daemon khởi động. Gửi nhắc lúc ${CONFIG.reminderTime} ICT mỗi ngày.`);

  function scheduleNext() {
    const now = new Date();
    const next = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      hours,
      minutes,
      0,
      0
    );
    if (next <= now) next.setDate(next.getDate() + 1);
    const msUntil = next - now;
    console.error(
      `⏳ Lần nhắc tiếp theo: ${next.toLocaleString("vi-VN")} (sau ${Math.round(msUntil / 60000)} phút)`
    );
    setTimeout(async () => {
      await cmdCheck(true);
      scheduleNext();
    }, msUntil);
  }

  scheduleNext();
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  try {
    if (args.add) cmdAdd();
    else if (args.remove) cmdRemove();
    else if (args.list) cmdList();
    else if (args.check) await cmdCheck(args.notify);
    else if (args.daemon) startDaemon();
    else {
      console.error("Thiếu lệnh. Dùng --help để xem hướng dẫn.");
      process.exit(1);
    }
  } catch (err) {
    console.error(`❌ Lỗi: ${err.message}`);
    process.exit(1);
  }
}

main();
