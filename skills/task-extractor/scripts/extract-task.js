#!/usr/bin/env node
/**
 * extract-task.js — Trích xuất nhiệm vụ/yêu cầu từ văn bản bằng NLP
 * US-13: Tự động nhận diện và phân loại nhiệm vụ từ công văn, biên bản
 */

import fs from "fs";
import path from "path";
import { parseArgs } from "util";
import { createHash } from "crypto";
import { spawnSync } from "child_process";

// ── Config ────────────────────────────────────────────────────────────────────
const CONFIG = {
  apiKey: process.env.OPENAI_API_KEY,
  model: process.env.EXTRACTION_MODEL ?? "gpt-4o-mini",
  confidenceThreshold: parseFloat(process.env.CONFIDENCE_THRESHOLD ?? "0.7"),
  defaultAssignee: process.env.DEFAULT_ASSIGNEE ?? null,
  deadlinesFile: process.env.DEADLINES_FILE ?? "./data/deadlines.json",
};

// ── CLI args ──────────────────────────────────────────────────────────────────
const { values: args } = parseArgs({
  options: {
    file: { type: "string", short: "f" },
    text: { type: "string", short: "t" },
    stdin: { type: "boolean" },
    "add-deadlines": { type: "boolean" },
    output: { type: "string", short: "o", default: "json" }, // json | text
    help: { type: "boolean", short: "h" },
  },
  strict: false,
});

if (args.help) {
  console.log(`
Sử dụng:
  node extract-task.js --file path/to/file.pdf
  node extract-task.js --text "Nội dung văn bản..."
  echo "Văn bản..." | node extract-task.js --stdin

Tham số:
  --add-deadlines    Tự động thêm tasks có deadline vào deadline-reminder
  --output json|text Định dạng output (mặc định: json)

Biến môi trường:
  OPENAI_API_KEY          (bắt buộc)
  EXTRACTION_MODEL        (mặc định: gpt-4o-mini)
  CONFIDENCE_THRESHOLD    (mặc định: 0.7)
  DEFAULT_ASSIGNEE        Người nhận mặc định
`);
  process.exit(0);
}

// ── Text input ────────────────────────────────────────────────────────────────
async function getInputText() {
  if (args.text) return args.text;

  if (args.stdin) {
    return new Promise((resolve) => {
      let data = "";
      process.stdin.on("data", (chunk) => (data += chunk));
      process.stdin.on("end", () => resolve(data));
    });
  }

  if (args.file) {
    const absPath = path.resolve(args.file);
    if (!fs.existsSync(absPath)) throw new Error(`File không tồn tại: ${absPath}`);

    const ext = path.extname(absPath).toLowerCase();

    if (ext === ".txt" || ext === ".md") {
      return fs.readFileSync(absPath, "utf8");
    }
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

  throw new Error("Cần --file, --text hoặc --stdin");
}

// ── NLP extraction via LLM ────────────────────────────────────────────────────
const EXTRACTION_PROMPT = `Bạn là chuyên gia phân tích văn bản hành chính Việt Nam.
Hãy trích xuất TẤT CẢ các nhiệm vụ, yêu cầu, phân công từ văn bản sau.

Với mỗi nhiệm vụ, trả về JSON object có cấu trúc:
{
  "title": "Tên nhiệm vụ ngắn gọn (< 100 ký tự)",
  "assignee": "Đơn vị/người được giao (null nếu không rõ)",
  "deadline": "YYYY-MM-DD hoặc null",
  "deadline_raw": "Nguyên văn hạn trong văn bản hoặc null",
  "priority": "high | medium | low",
  "confidence": 0.0-1.0,
  "source_sentence": "Câu trích dẫn gốc từ văn bản"
}

Quy tắc xác định priority:
- high: có từ khóa "ngay", "gấp", "khẩn", deadline <= 3 ngày, hoặc yêu cầu từ cấp trên
- medium: deadline trong 1-2 tuần, nhiệm vụ thường xuyên
- low: không có deadline rõ ràng, mang tính định hướng

Trả về JSON array, không thêm text khác.
Nếu không có nhiệm vụ nào, trả về [].`;

async function extractTasksWithLLM(text) {
  if (!CONFIG.apiKey) throw new Error("Thiếu OPENAI_API_KEY");

  const { default: OpenAI } = await import("openai").catch(() => {
    throw new Error("Cần cài đặt: npm install openai");
  });

  const openai = new OpenAI({ apiKey: CONFIG.apiKey });

  const truncated = text.slice(0, 12000); // Stay within token limits

  const response = await openai.chat.completions.create({
    model: CONFIG.model,
    messages: [
      { role: "system", content: EXTRACTION_PROMPT },
      {
        role: "user",
        content: `Văn bản cần phân tích:\n\n${truncated}`,
      },
    ],
    temperature: 0.1,
    response_format: { type: "json_object" },
  });

  const raw = response.choices[0].message.content;

  // Handle both {tasks:[...]} and [...] formats
  let parsed;
  try {
    parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (parsed.tasks) return parsed.tasks;
    // Try to find any array value
    const arrVal = Object.values(parsed).find(Array.isArray);
    if (arrVal) return arrVal;
    return [];
  } catch {
    // Fallback: try to extract JSON array from text
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
    return [];
  }
}

// ── Rule-based fallback extractor ─────────────────────────────────────────────
function extractTasksRuleBased(text) {
  const tasks = [];
  const lines = text.split(/\r?\n/);

  // Pattern: action verbs followed by unit/person
  const actionPatterns = [
    /(?:giao|yêu cầu|đề nghị|chỉ đạo|phân công)\s+([^\n,;]+?)\s+(?:thực hiện|triển khai|báo cáo|lập|xây dựng|hoàn thành|chuẩn bị)([^\n.;]*)/gi,
    /([^\n,;]+?)\s+(?:có trách nhiệm|chịu trách nhiệm|phụ trách)\s+([^\n.;]+)/gi,
  ];

  lines.forEach((line, idx) => {
    for (const pattern of actionPatterns) {
      pattern.lastIndex = 0;
      const m = pattern.exec(line);
      if (m) {
        const deadlineMatch = line.match(
          /(?:trước|hạn)[^.]*?(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)/i
        );

        tasks.push({
          id: `rule-${createHash("md5").update(line).digest("hex").slice(0, 8)}`,
          title: line.trim().slice(0, 100),
          assignee: m[1]?.trim() ?? null,
          deadline: null,
          deadline_raw: deadlineMatch?.[1] ?? null,
          priority: /khẩn|ngay|gấp/i.test(line) ? "high" : "medium",
          confidence: 0.65,
          source_sentence: line.trim(),
          method: "rule-based",
        });
      }
    }
  });

  return tasks;
}

// ── Add deadlines to reminder ─────────────────────────────────────────────────
function addTasksToDeadlineReminder(tasks, source) {
  const cronScript = path.resolve(
    __dirname,
    "../../deadline-reminder/scripts/cron.js"
  );

  let added = 0;
  tasks
    .filter((t) => t.deadline && t.confidence >= CONFIG.confidenceThreshold)
    .forEach((task) => {
      const result = spawnSync(
        "node",
        [
          cronScript,
          "--add",
          "--title", task.title,
          "--deadline", task.deadline,
          "--ref", source ?? "extract-task",
          "--priority", task.priority,
        ],
        { encoding: "utf8" }
      );

      if (result.status === 0) {
        added++;
      } else {
        console.error(`⚠️  Không thể thêm task "${task.title}": ${result.stderr}`);
      }
    });

  return added;
}

import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Output formatter ──────────────────────────────────────────────────────────
function printTextOutput(tasks, source) {
  console.log(`\n📋 NHIỆM VỤ TRÍCH XUẤT TỪ: ${source ?? "văn bản"}\n`);
  console.log("=".repeat(60));

  const withDeadline = tasks.filter((t) => t.deadline || t.deadline_raw);
  const withoutDeadline = tasks.filter((t) => !t.deadline && !t.deadline_raw);

  if (withDeadline.length) {
    console.log("\n📅 CÓ DEADLINE:");
    withDeadline.forEach((t, i) => {
      const pri = t.priority === "high" ? "🚨" : t.priority === "medium" ? "⚠️" : "📌";
      console.log(`\n${i + 1}. ${pri} ${t.title}`);
      if (t.assignee) console.log(`   👤 Giao: ${t.assignee}`);
      console.log(
        `   📅 Hạn: ${t.deadline ?? t.deadline_raw ?? "(chưa rõ)"}`
      );
      console.log(`   🎯 Độ tin cậy: ${Math.round(t.confidence * 100)}%`);
    });
  }

  if (withoutDeadline.length) {
    console.log("\n📌 KHÔNG CÓ DEADLINE CỤ THỂ:");
    withoutDeadline.forEach((t, i) => {
      console.log(`\n${i + 1}. ${t.title}`);
      if (t.assignee) console.log(`   👤 Giao: ${t.assignee}`);
    });
  }

  console.log(`\n✅ Tổng: ${tasks.length} nhiệm vụ`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  try {
    const text = await getInputText();
    const source = args.file ? path.basename(args.file) : "text-input";

    console.error(`🔍 Đang phân tích: ${source}`);

    let tasks = [];

    // Try LLM-based extraction first, fall back to rule-based
    try {
      tasks = await extractTasksWithLLM(text);
      tasks = tasks
        .filter((t) => t.confidence >= CONFIG.confidenceThreshold)
        .map((t, i) => ({ id: `task-${String(i + 1).padStart(3, "0")}`, ...t }));
    } catch (llmErr) {
      console.error(`⚠️  LLM không khả dụng (${llmErr.message}), dùng rule-based fallback`);
      tasks = extractTasksRuleBased(text);
    }

    // Auto-add deadlines if requested
    let addedCount = 0;
    if (args["add-deadlines"] && tasks.length > 0) {
      addedCount = addTasksToDeadlineReminder(tasks, source);
      console.error(`✅ Đã thêm ${addedCount} deadline vào deadline-reminder`);
    }

    const output = {
      source,
      tasks,
      summary: `Tìm thấy ${tasks.length} nhiệm vụ${addedCount ? `, đã thêm ${addedCount} deadline` : ""}`,
    };

    if (args.output === "text") {
      printTextOutput(tasks, source);
    } else {
      console.log(JSON.stringify(output, null, 2));
    }
  } catch (err) {
    console.error(`❌ Lỗi: ${err.message}`);
    process.exit(1);
  }
}

main();
