#!/usr/bin/env node
/**
 * extract-task.js — Trích xuất nhiệm vụ từ văn bản bằng rule-based NLP
 *
 * Script này KHÔNG gọi LLM. Agent (OpenClaw) đã đọc văn bản và
 * phân tích nhiệm vụ bằng model của nó. Script này chỉ:
 *  1. Đọc file (PDF/DOCX/TXT) → trả về text thô để agent phân tích
 *  2. Hoặc: chạy rule-based extraction nhanh làm gợi ý ban đầu
 *  3. Thêm tasks vào deadline-reminder khi agent xác nhận
 */

import fs from "fs";
import path from "path";
import { parseArgs } from "util";
import { createHash } from "crypto";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── CLI args ──────────────────────────────────────────────────────────────────
const { values: args } = parseArgs({
  options: {
    file: { type: "string", short: "f" },
    text: { type: "string", short: "t" },
    stdin: { type: "boolean" },
    "read-only": { type: "boolean" },      // chỉ trả text thô, để agent phân tích
    "add-deadline": { type: "boolean" },   // thêm 1 task vào deadline-reminder
    title: { type: "string" },
    deadline: { type: "string" },
    ref: { type: "string" },
    priority: { type: "string", default: "medium" },
    output: { type: "string", short: "o", default: "json" },
    help: { type: "boolean", short: "h" },
  },
  strict: false,
});

if (args.help) {
  console.log(`
Sử dụng:
  # Trả text thô để agent đọc và phân tích
  node extract-task.js --file path/to/file.pdf --read-only

  # Rule-based extraction (gợi ý nhanh)
  node extract-task.js --file path/to/file.pdf
  node extract-task.js --text "Giao phòng CNTT báo cáo trước 15/4"

  # Thêm task vào deadline-reminder (agent gọi sau khi xác nhận)
  node extract-task.js --add-deadline --title "..." --deadline "2026-04-15" --ref "123/CV"

Tham số:
  --read-only       Chỉ đọc file và trả text thô (agent tự phân tích)
  --output json|text
`);
  process.exit(0);
}

// ── File reading ──────────────────────────────────────────────────────────────
async function readFileText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) throw new Error(`File không tồn tại: ${absPath}`);

  if (ext === ".txt" || ext === ".md") return fs.readFileSync(absPath, "utf8");

  if (ext === ".pdf") {
    const { default: pdfParse } = await import("pdf-parse").catch(() => {
      throw new Error("Cần cài đặt: npm install pdf-parse");
    });
    return (await pdfParse(fs.readFileSync(absPath))).text;
  }

  if (ext === ".docx") {
    const mammoth = await import("mammoth").catch(() => {
      throw new Error("Cần cài đặt: npm install mammoth");
    });
    return (await mammoth.extractRawText({ path: absPath })).value;
  }

  throw new Error(`Định dạng không hỗ trợ: ${ext}`);
}

async function getInputText() {
  if (args.text) return args.text;
  if (args.stdin) {
    return new Promise((resolve) => {
      let data = "";
      process.stdin.on("data", (c) => (data += c));
      process.stdin.on("end", () => resolve(data));
    });
  }
  if (args.file) return readFileText(args.file);
  throw new Error("Cần --file, --text hoặc --stdin");
}

// ── Rule-based extraction (gợi ý, không cần LLM) ─────────────────────────────
function extractTasksRuleBased(text, source) {
  const tasks = [];
  const lines = text.split(/\r?\n/);

  const actionPatterns = [
    // "giao X thực hiện / báo cáo / lập / chuẩn bị..."
    /(?:giao|yêu cầu|đề nghị|chỉ đạo|phân công)\s+([^,;\n]{3,40}?)\s+(?:thực hiện|triển khai|báo cáo|lập|xây dựng|hoàn thành|chuẩn bị|kiểm tra)/gi,
    // "X chịu trách nhiệm..."
    /([^,;\n]{3,40}?)\s+(?:có trách nhiệm|chịu trách nhiệm|phụ trách)\s+([^\n.;]{5,})/gi,
  ];

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (trimmed.length < 10) return;

    for (const pattern of actionPatterns) {
      pattern.lastIndex = 0;
      const m = pattern.exec(trimmed);
      if (!m) continue;

      const deadlineMatch = trimmed.match(
        /(?:trước\s+(?:ngày)?|hạn)[^.]{0,20}?(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)/i
      );

      tasks.push({
        id: `rule-${createHash("md5").update(trimmed).digest("hex").slice(0, 8)}`,
        title: trimmed.slice(0, 120),
        assignee: m[1]?.trim().replace(/^[,;\s]+|[,;\s]+$/g, "") ?? null,
        deadline: null,
        deadline_raw: deadlineMatch?.[1] ?? null,
        priority: /khẩn|ngay|gấp|hỏa tốc/i.test(trimmed) ? "high" : "medium",
        confidence: 0.65,
        source_sentence: trimmed,
        method: "rule-based",
      });
      break;
    }
  });

  return { source, tasks, note: "Rule-based extraction — agent nên xem lại và bổ sung" };
}

// ── Add deadline to reminder ──────────────────────────────────────────────────
function addDeadline() {
  if (!args.title || !args.deadline) {
    console.error("❌ --add-deadline yêu cầu --title và --deadline");
    process.exit(1);
  }

  const cronScript = path.resolve(__dirname, "../../deadline-reminder/scripts/cron.js");

  const result = spawnSync(
    "node",
    [
      cronScript,
      "--add",
      "--title", args.title,
      "--deadline", args.deadline,
      ...(args.ref ? ["--ref", args.ref] : []),
      "--priority", args.priority,
    ],
    { encoding: "utf8" }
  );

  if (result.status === 0) {
    console.log(result.stdout);
  } else {
    console.error(`❌ Không thể thêm deadline: ${result.stderr}`);
    process.exit(1);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  try {
    // Mode: thêm deadline (agent đã xác nhận, gọi trực tiếp)
    if (args["add-deadline"]) {
      addDeadline();
      return;
    }

    const text = await getInputText();
    const source = args.file ? path.basename(args.file) : "text-input";

    // Mode: chỉ đọc file, trả text thô để agent phân tích
    if (args["read-only"]) {
      console.log(
        JSON.stringify(
          {
            source,
            text_length: text.length,
            text: text.slice(0, 15000), // giới hạn context window
            truncated: text.length > 15000,
          },
          null,
          2
        )
      );
      return;
    }

    // Mode: rule-based extraction (gợi ý nhanh cho agent)
    const result = extractTasksRuleBased(text, source);

    if (args.output === "text") {
      console.log(`\n📋 GỢI Ý TASKS TỪ: ${source}\n${"=".repeat(50)}`);
      if (!result.tasks.length) {
        console.log("Không tìm thấy pattern nhiệm vụ rõ ràng. Agent nên đọc toàn văn bản.");
      }
      result.tasks.forEach((t, i) => {
        console.log(`\n${i + 1}. ${t.title}`);
        if (t.assignee) console.log(`   👤 ${t.assignee}`);
        if (t.deadline_raw) console.log(`   📅 ${t.deadline_raw}`);
      });
    } else {
      console.log(JSON.stringify(result, null, 2));
    }
  } catch (err) {
    console.error(`❌ Lỗi: ${err.message}`);
    process.exit(1);
  }
}

main();
