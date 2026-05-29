#!/usr/bin/env node
/**
 * rag.js — Retrieval-Augmented Generation cho knowledge base nội bộ
 * US-08: Tra cứu văn bản, quy định từ kho tài liệu
 */

import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { parseArgs } from "util";
import { getDatabase, storeDocument, storeExtraction } from "../../../lib/database.js";
import { normalizeDate } from "../../../lib/dates.js";
import { fileHash, readDocumentText } from "../../../lib/documents.js";
import { printEnvelope, printError } from "../../../lib/response.js";

const SKILL = "knowledge-base";
const INDEX_SCHEMA_VERSION = 2;

// ── Config ────────────────────────────────────────────────────────────────────
const CONFIG = {
  apiKey: process.env.OPENAI_API_KEY,
  openaiBaseUrl: process.env.OPENAI_BASE_URL ?? process.env.OPENAI_API_BASE,
  embeddingModel: process.env.EMBEDDING_MODEL ?? "text-embedding-3-small",
  generationModel: process.env.GENERATION_MODEL ?? "gpt-4o-mini",
  generationProvider: (process.env.GENERATION_PROVIDER ?? (process.env.OLLAMA_CHAT_MODEL ? "ollama" : "openai")).toLowerCase(),
  embeddingProvider: (process.env.EMBEDDING_PROVIDER ?? "openai").toLowerCase(),
  ollamaHost: process.env.OLLAMA_HOST ?? "http://localhost:11434",
  ollamaEmbeddingModel: process.env.OLLAMA_EMBEDDING_MODEL ?? "nomic-embed-text",
  ollamaChatModel: process.env.OLLAMA_CHAT_MODEL ?? "qwen2.5:3b-instruct",
  enableGeneration: (process.env.ENABLE_GENERATION ?? "false").toLowerCase() === "true",
  strictAnswer: (process.env.STRICT_ANSWER ?? "true").toLowerCase() === "true",
  allowFallback: (process.env.ALLOW_FALLBACK ?? "true").toLowerCase() === "true",
  lexicalTopK: parseInt(process.env.LEXICAL_TOP_K ?? "3"),
  chunkSize: parseInt(process.env.CHUNK_SIZE ?? "350"),
  chunkOverlap: parseInt(process.env.CHUNK_OVERLAP ?? "80"),
  chunkMinChars: parseInt(process.env.CHUNK_MIN_CHARS ?? "60"),
  chunkMax: parseInt(process.env.CHUNK_MAX ?? "0"),
  dataDir: process.env.KB_DATA_DIR ?? "./data/knowledge-base",
  indexDir: process.env.KB_INDEX_DIR ?? "./data/kb-index",
  similarityThreshold: parseFloat(process.env.SIMILARITY_THRESHOLD ?? "0.75"),
  topK: parseInt(process.env.TOP_K ?? "5"),
  queryRewrite: (process.env.QUERY_REWRITE ?? "true").toLowerCase() === "true",
  queryVariants: parseInt(process.env.QUERY_VARIANTS ?? "3"),
  maxContextChunks: parseInt(process.env.MAX_CONTEXT_CHUNKS ?? "8"),
  benchmarkFile: process.env.KB_BENCHMARK_FILE ?? "./skills/knowledge-base/references/eval-benchmark.json",
};

// ── CLI args ──────────────────────────────────────────────────────────────────
const { values: args } = parseArgs({
  options: {
    query: { type: "string", short: "q" },
    add: { type: "boolean" },
    build: { type: "boolean" },
    stats: { type: "boolean" },
    reset: { type: "boolean" },
    remove: { type: "boolean" },
    file: { type: "string", short: "f" },
    dir: { type: "string", short: "d" },
    source: { type: "string", short: "s" },
    label: { type: "string" },
    "display-name": { type: "string" },
    "top-k": { type: "string" },
    "chunk-size": { type: "string" },
    "overlap": { type: "string" },
    "min-chars": { type: "string" },
    "max-chunks": { type: "string" },
    eval: { type: "boolean" },
    benchmark: { type: "string" },
    "migrate-index": { type: "boolean" },
    help: { type: "boolean", short: "h" },
  },
  strict: false,
});

if (args.help) {
  console.log(`
Sử dụng:
  node rag.js --stats
  node rag.js --reset
  node rag.js --remove --label "Ten van ban"
  node rag.js --remove --file path/to/file.pdf
  node rag.js --query "câu hỏi"
  node rag.js --add --file path/to/file.pdf
  node rag.js --add --file path/to/file.pdf --display-name "Ten file goc"
  node rag.js --add --dir path/to/directory
  node rag.js --build --source path/to/documents

Biến môi trường:
  EMBEDDING_PROVIDER      (openai|ollama|openai-compatible, mặc định: openai)
  GENERATION_PROVIDER     (openai|ollama, mặc định: openai unless OLLAMA_CHAT_MODEL is set)
  OPENAI_API_KEY          (bắt buộc nếu dùng openai)
  OPENAI_BASE_URL         (dùng cho OpenAI-compatible như LM Studio)
  EMBEDDING_MODEL         (mặc định: text-embedding-3-small)
  GENERATION_MODEL        (mặc định: gpt-4o-mini)
  OLLAMA_CHAT_MODEL       (mặc định: qwen2.5:3b-instruct)
  ENABLE_GENERATION       (true|false, mặc định: false)
  STRICT_ANSWER           (true|false, mặc định: true)
  ALLOW_FALLBACK          (true|false, mặc định: true)
  LEXICAL_TOP_K           (mặc định: 3)
  OLLAMA_HOST             (mặc định: http://localhost:11434)
  OLLAMA_EMBEDDING_MODEL  (mặc định: nomic-embed-text)
  CHUNK_SIZE              (mặc định: 350)
  CHUNK_OVERLAP           (mặc định: 80)
  CHUNK_MIN_CHARS         (mặc định: 60)
  CHUNK_MAX               (mặc định: 0 = không giới hạn)
  QUERY_REWRITE           (true|false, mặc định: true)
  QUERY_VARIANTS          (mặc định: 3)
  MAX_CONTEXT_CHUNKS      (mặc định: 8)
  KB_BENCHMARK_FILE       (mặc định: ./skills/knowledge-base/references/eval-benchmark.json)
  KB_DATA_DIR             (mặc định: ./data/knowledge-base)
  KB_INDEX_DIR            (mặc định: ./data/kb-index)
  SIMILARITY_THRESHOLD    (mặc định: 0.75)
  TOP_K                   (mặc định: 5)

Index:
  --migrate-index         Nâng index.json cũ sang schema_version hiện tại
`);
  process.exit(0);
}

function resolveChunkConfig() {
  const chunkSize = args["chunk-size"] ? parseInt(args["chunk-size"]) : CONFIG.chunkSize;
  const chunkOverlap = args.overlap ? parseInt(args.overlap) : CONFIG.chunkOverlap;
  const chunkMinChars = args["min-chars"] ? parseInt(args["min-chars"]) : CONFIG.chunkMinChars;
  const chunkMax = args["max-chunks"] ? parseInt(args["max-chunks"]) : CONFIG.chunkMax;

  return {
    chunkSize: Number.isNaN(chunkSize) ? CONFIG.chunkSize : chunkSize,
    chunkOverlap: Number.isNaN(chunkOverlap) ? CONFIG.chunkOverlap : chunkOverlap,
    chunkMinChars: Number.isNaN(chunkMinChars) ? CONFIG.chunkMinChars : chunkMinChars,
    chunkMax: Number.isNaN(chunkMax) ? CONFIG.chunkMax : chunkMax,
  };
}

// ── OpenAI client helpers ─────────────────────────────────────────────────────
async function getOpenAI({ requireKey }) {
  const { default: OpenAI } = await import("openai").catch(() => {
    throw new Error("Cần cài đặt: npm install openai");
  });
  if (requireKey && !CONFIG.apiKey) throw new Error("Thiếu OPENAI_API_KEY");
  return new OpenAI({
    apiKey: CONFIG.apiKey ?? "lm-studio",
    baseURL: CONFIG.openaiBaseUrl,
  });
}

async function embed(text) {
  if (CONFIG.embeddingProvider === "ollama") {
    return embedWithOllama(text);
  }

  const openai = await getOpenAI({ requireKey: CONFIG.embeddingProvider === "openai" });
  const response = await openai.embeddings.create({
    model: CONFIG.embeddingModel,
    input: text.slice(0, 8000),
  });
  return response.data[0].embedding;
}

async function generate(systemPrompt, userPrompt) {
  if (CONFIG.generationProvider === "ollama") {
    const baseUrl = CONFIG.ollamaHost.replace(/\/$/, "");
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: CONFIG.ollamaChatModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        stream: false,
      }),
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Ollama chat lỗi ${response.status}: ${errText}`);
    }
    const data = await response.json();
    return data?.message?.content ?? "";
  }

  const openai = await getOpenAI({ requireKey: CONFIG.generationProvider === "openai" });
  const response = await openai.chat.completions.create({
    model: CONFIG.generationModel,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.3,
  });
  return response.choices[0].message.content;
}

async function embedWithOllama(text) {
  const baseUrl = CONFIG.ollamaHost.replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: CONFIG.ollamaEmbeddingModel,
      prompt: text.slice(0, 8000),
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Ollama embeddings lỗi ${response.status}: ${errText}`);
  }

  const data = await response.json();
  if (!data.embedding) throw new Error("Ollama embeddings không trả về embedding");
  return data.embedding;
}

// ── Vector index helpers ──────────────────────────────────────────────────────
const INDEX_FILE = path.join(CONFIG.indexDir, "index.json");

function readRawIndex() {
  if (!fs.existsSync(INDEX_FILE)) {
    return {
      schema_version: INDEX_SCHEMA_VERSION,
      created_at: null,
      updated_at: null,
      entries: [],
    };
  }

  const raw = JSON.parse(fs.readFileSync(INDEX_FILE, "utf8"));
  if (Array.isArray(raw)) {
    return {
      schema_version: 1,
      created_at: null,
      updated_at: null,
      entries: raw,
    };
  }

  if (raw && Array.isArray(raw.entries)) {
    return {
      schema_version: raw.schema_version ?? 1,
      created_at: raw.created_at ?? null,
      updated_at: raw.updated_at ?? null,
      entries: raw.entries,
    };
  }

  return {
    schema_version: INDEX_SCHEMA_VERSION,
    created_at: null,
    updated_at: null,
    entries: [],
  };
}

function loadIndex() {
  return readRawIndex().entries;
}

function saveIndex(index, { createdAt = null } = {}) {
  fs.mkdirSync(CONFIG.indexDir, { recursive: true });
  const temporaryPath = `${INDEX_FILE}.tmp-${process.pid}`;
  const now = new Date().toISOString();
  const payload = {
    schema_version: INDEX_SCHEMA_VERSION,
    created_at: createdAt ?? readRawIndex().created_at ?? now,
    updated_at: now,
    entries: index,
  };
  fs.writeFileSync(temporaryPath, JSON.stringify(payload, null, 2), "utf8");
  fs.renameSync(temporaryPath, INDEX_FILE);
}

function migrateIndex() {
  if (!fs.existsSync(INDEX_FILE)) {
    return { migrated: false, schema_version: INDEX_SCHEMA_VERSION, entries: 0 };
  }
  const raw = readRawIndex();
  if (raw.schema_version === INDEX_SCHEMA_VERSION) {
    return { migrated: false, schema_version: raw.schema_version, entries: raw.entries.length };
  }
  saveIndex(raw.entries, { createdAt: raw.created_at });
  return { migrated: true, schema_version: INDEX_SCHEMA_VERSION, entries: raw.entries.length };
}

function resetIndex() {
  if (fs.existsSync(INDEX_FILE)) {
    fs.unlinkSync(INDEX_FILE);
  }
}

function removeEntries({ label, file }) {
  const index = loadIndex();
  if (index.length === 0) return { removed: 0, remaining: 0 };

  const absPath = file ? path.resolve(file) : null;
  const fileId = absPath ? createHash("md5").update(absPath).digest("hex") : null;

  const filtered = index.filter((entry) => {
    if (label) {
      const labelMatch =
        entry.sourceLabel === label ||
        entry.source === label ||
        entry.sourceFile === label;
      if (labelMatch) return false;
    }
    if (absPath) {
      if (entry.sourcePath === absPath || entry.fileId === fileId) return false;
    }
    return true;
  });

  const removed = index.length - filtered.length;
  saveIndex(filtered);
  return { removed, remaining: filtered.length };
}

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ── Text chunking ─────────────────────────────────────────────────────────────
function isHeadingLine(line) {
  return (
    /^(?:CHƯƠNG|PHẦN|MỤC|I{1,3}|IV|V|VI|VII|VIII|IX|X)\b/i.test(line) ||
    /^(?:\d+\.|[A-ZĐ]\.|[IVX]+\.)\s+/.test(line) ||
    /^(?:KẾT LUẬN|NỘI DUNG|CĂN CỨ|NƠI NHẬN|KÍNH GỬI|KÍNH TRÌNH|PHỤ LỤC)\b/i.test(line)
  );
}

function chunkText(text, chunkSize = 500, overlap = 100) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const chunks = [];
  let current = "";

  const pushCurrent = () => {
    if (current.trim()) chunks.push(current.trim());
  };

  for (const paragraph of paragraphs) {
    const blocks = paragraph.split(/\n/).map((line) => line.trim()).filter(Boolean);
    for (const block of blocks) {
      const next = current ? `${current}\n${block}` : block;
      if (next.length > chunkSize && current.length > 0) {
        pushCurrent();
        const tail = current.split(/\s+/).slice(-Math.max(10, Math.floor(overlap / 6))).join(" ");
        current = `${tail} ${block}`.trim();
      } else if (block.length > chunkSize) {
        pushCurrent();
        current = block;
      } else {
        current = next;
      }
      if (isHeadingLine(block) && current.length >= Math.floor(chunkSize * 0.6)) {
        pushCurrent();
        current = "";
      }
    }
  }

  pushCurrent();
  return chunks;
}

function normalizeText(text) {
  return text
    .replace(/\uFEFF/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[\t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeForSearch(text) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function inferTitle(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return null;

  const title = lines[0].replace(/\s+/g, " ");
  return title.length > 120 ? `${title.slice(0, 120)}...` : title;
}

function inferDocumentType(text) {
  const normalized = normalizeForSearch(text);
  if (/quy che|quy che noi bo|quy dinh noi bo/.test(normalized)) return "quy-che";
  if (/bien ban/.test(normalized) || /cuoc hop|hop giao ban|ban giao/.test(normalized)) return "bien-ban";
  if (/to trinh/.test(normalized)) return "to-trinh";
  if (/quyet dinh/.test(normalized)) return "quyet-dinh";
  if (/cong van/.test(normalized) || /van ban/.test(normalized)) return "cong-van";
  return "unknown";
}

function inferDocumentTypeFromHeader(lines) {
  const headerLines = lines.slice(0, 40);
  const header = headerLines.join("\n");
  const normalized = normalizeForSearch(header);

  // Strong signals in Vietnamese administrative docs.
  const hasVv = headerLines.some((line) => /\bV\/v\b/iu.test(line));
  const hasToTrinhHeader = headerLines.some((line) => /^tờ\s+trình\b/iu.test(line));
  if (hasVv) return "cong-van";
  if (hasToTrinhHeader) return "to-trinh";

  if (/quy che|quy che noi bo|quy dinh noi bo/.test(normalized)) return "quy-che";
  if (/bien ban/.test(normalized) || /cuoc hop|hop giao ban|ban giao/.test(normalized)) return "bien-ban";
  if (/quyet dinh/.test(normalized)) return "quyet-dinh";
  if (/cong van/.test(normalized) || /van ban/.test(normalized)) return "cong-van";
  if (/to trinh/.test(normalized)) return "to-trinh";
  return null;
}

function inferIssueDate(lines) {
  const headerLines = lines.slice(0, 60);
  const stopWords = /^(?:căn\s+cứ|theo|dựa\s+trên|chiếu\s+theo)\b/iu;

  const strongPattern = /(?:^|,\s*)ngày\s*\d{1,2}\s*tháng\s*\d{1,2}\s*năm\s*\d{4}\b/iu;
  const mediumPattern = /\bngày\s*\d{1,2}\b/iu;
  const legalRefNoise = /\b(quyết\s+định|nghị\s+định|thông\s+tư|văn\s+bản|kế\s+hoạch|chỉ\s+thị|luật)\b/iu;

  const candidates = [];
  for (let i = 0; i < headerLines.length; i++) {
    const line = headerLines[i];
    if (!line) continue;
    if (stopWords.test(line)) continue;
    const parsed = normalizeDate(line);
    if (!parsed) continue;

    let score = 0;
    if (strongPattern.test(line)) score += 5;
    if (mediumPattern.test(line)) score += 2;
    if (i < 25) score += 1;
    if (legalRefNoise.test(line) && !strongPattern.test(line)) score -= 2;
    candidates.push({ parsed, score, index: i });
  }

  if (candidates.length) {
    candidates.sort((a, b) => b.score - a.score || b.parsed.localeCompare(a.parsed) || a.index - b.index);
    return candidates[0].parsed;
  }

  // Prefer explicit header date lines (usually near the top) and avoid legal-basis dates.
  for (const line of headerLines) {
    if (!line) continue;
    if (stopWords.test(line)) continue;
    if (!/\bngày\b/iu.test(line)) continue;
    const parsed = normalizeDate(line);
    if (parsed) return parsed;
  }

  // Fallback: any parsed date in header excluding legal-basis lines.
  for (const line of headerLines) {
    if (!line) continue;
    if (stopWords.test(line)) continue;
    const parsed = normalizeDate(line);
    if (parsed) return parsed;
  }

  // Last resort: any date anywhere.
  for (const line of lines) {
    const parsed = normalizeDate(line);
    if (parsed) return parsed;
  }
  return null;
}

function tokenizeSearchTerms(text) {
  return normalizeForSearch(text)
    .split(/\s+/)
    .filter((word) => word.length >= 3);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function extractDocumentMetadata(text, filePath, { pageCount = null, sourceLabel = null } = {}) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const normalizedText = normalizeForSearch(text);
  const title = inferTitle(text);
  let documentNumber =
    // Prefer strict number right after 'Số:' to avoid capturing the subject (V/v).
    text.match(/\bSố\s*:\s*([0-9A-ZĐ\/.-]{3,60})\b/iu)?.[1]?.trim() ??
    text.match(/\b(?:CV|TTr|BB|QD|NQ|TB)\s*[-:]\s*([A-ZĐ0-9\/.-]{3,50})/iu)?.[1]?.trim() ??
    text.match(/\b(\d{1,5}\/[A-ZĐ0-9.-]{2,})\b/u)?.[1]?.trim() ??
    // Fallback: broader capture from the 'Số:' line.
    text.match(/\bSố\s*:\s*([^\n]{1,80}?)(?:\s+(?:V\/v|Về\s+việc)\b|$)/iu)?.[1]?.trim() ??
    null;

  if (documentNumber) {
    // If the line got merged (e.g., "047/... V/v ..."), keep only the number token.
    documentNumber = documentNumber.split(/\bV\/v\b/iu)[0].trim();
    documentNumber = documentNumber.split(/\s+/)[0].trim();
    documentNumber = documentNumber.replace(/[:;,.]+$/u, "");
  }
  const issueDate = inferIssueDate(lines);
  const issuer =
    lines.find((line) => /(?:UBND|ỦY BAN|SỞ|BỘ|CỤC|PHÒNG|TRƯỜNG|VIỆN|TRUNG TÂM)/iu.test(line)) ??
    null;
  const recipient = lines.find((line) => /kính\s+(?:gửi|trình)|nơi\s+nhận/iu.test(line)) ?? null;
  const headings = lines
    .filter((line) => isHeadingLine(line))
    .slice(0, 12);
  const hasAttachment = /phụ lục|đính kèm|attachment/i.test(normalizedText);
  const hasTable = /\|.+\|/.test(text) || /\t/.test(text);
  const likelyListDocument = /^\s*(?:\d+\.|[-–•])\s+/m.test(text);
  const subject =
    text.match(/(?:V\/v|Về việc)\s*:?\s*(.+)/iu)?.[1]?.trim() ??
    lines.find((line) => /(?:V\/v|Về việc)/iu.test(line)) ??
    null;
  const documentType = inferDocumentTypeFromHeader(lines) ?? inferDocumentType(text);
  const typeSpecific = extractTypeSpecificMetadata(text, documentType, lines, normalizedText);
  const keywords = unique(
    [
      ...tokenizeSearchTerms([title, subject, issuer, recipient, sourceLabel].filter(Boolean).join(" ")),
      ...(documentNumber ? tokenizeSearchTerms(documentNumber) : []),
      ...(issueDate ? tokenizeSearchTerms(issueDate) : []),
    ].filter((keyword) => normalizedText.includes(keyword))
  ).slice(0, 12);

  return {
    title,
    document_number: documentNumber,
    issue_date: issueDate,
    issuer,
    recipient,
    subject,
    document_type: documentType,
    ...typeSpecific,
    keywords,
    structure: {
      headings,
      has_attachment: hasAttachment,
      has_table: hasTable,
      likely_list_document: likelyListDocument,
    },
    source_file: path.basename(filePath),
    page_count: pageCount,
    document_identities: unique([title, documentNumber, subject].filter(Boolean)).slice(0, 5),
  };
}

function extractTypeSpecificMetadata(text, documentType, lines, normalizedText) {
  const data = {};

  if (documentType === "cong-van") {
    data.deadline_hint = lines.find((line) => /trước ngày|chậm nhất|hạn|trong vòng/i.test(line)) ?? null;
    data.requested_actions = lines
      .filter((line) => /(?:yêu cầu|đề nghị|đề xuất|thực hiện|phối hợp|báo cáo)/iu.test(line))
      .slice(0, 8);
    data.references = unique([
      ...(text.match(/(?:Căn cứ|Dựa trên)\s*:\s*([^\n]{5,120})/iu)?.[1] ? [text.match(/(?:Căn cứ|Dựa trên)\s*:\s*([^\n]{5,120})/iu)[1].trim()] : []),
      ...lines.filter((line) => /(?:căn cứ|theo|dựa trên)/iu.test(line)).slice(0, 6),
    ]).slice(0, 8);
  }

  if (documentType === "to-trinh") {
    data.proposal_summary =
      text.match(/(?:Kính trình|Trình|Đề nghị)\s*:\s*([^\n]{5,180})/iu)?.[1]?.trim() ??
      lines.find((line) => /(?:kính trình|trình|đề nghị)/iu.test(line)) ??
      null;
    data.requested_approval = lines.find((line) => /phê duyệt|chấp thuận|xem xét|cho phép/i.test(line)) ?? null;
    data.reason = lines.find((line) => /lý do|căn cứ|sự cần thiết|mục đích/i.test(line)) ?? null;
  }

  if (documentType === "bien-ban") {
    data.meeting_time = lines.find((line) => /thời gian|bắt đầu|kết thúc/i.test(line)) ?? null;
    data.location = lines.find((line) => /địa điểm|phòng họp|văn phòng/i.test(line)) ?? null;
    data.participants = lines
      .filter((line) => /(?:thành phần|tham dự|chủ trì|thư ký|đại biểu)/iu.test(line))
      .slice(0, 8);
    data.conclusions = lines
      .filter((line) => /(?:kết luận|thống nhất|phân công|giao|đề nghị)/iu.test(line))
      .slice(0, 8);
  }

  if (documentType === "quyet-dinh") {
    data.effective_date = lines.find((line) => /hiệu lực|có hiệu lực|từ ngày/i.test(line)) ?? null;
    data.signer = lines.find((line) => /(?:chủ tịch|giám đốc|thủ trưởng|quyền|ký)/iu.test(line)) ?? null;
    data.scope = lines.find((line) => /phạm vi|đối tượng|áp dụng/i.test(line)) ?? null;
  }

  if (documentType === "quy-che") {
    data.scope = lines.find((line) => /phạm vi|đối tượng|áp dụng/i.test(line)) ?? null;
    data.process_summary = lines
      .filter((line) => /(?:tiếp nhận|phân loại|xử lý|lưu trữ|thời hạn|phân công)/iu.test(line))
      .slice(0, 10);
    data.compliance_basis = lines.find((line) => /(?:căn cứ|nghị định|thông tư|luật)/iu.test(line)) ?? null;
  }

  const cleaned = Object.fromEntries(
    Object.entries(data).filter(([, value]) => {
      if (Array.isArray(value)) return value.length > 0;
      return value !== null && value !== undefined && value !== "";
    })
  );

  if (normalizedText.includes("phụ lục")) cleaned.has_attachment_section = true;
  return cleaned;
}

function metadataToContext(metadata) {
  if (!metadata) return null;
  const parts = [];
  if (metadata.title) parts.push(`Tiêu đề: ${metadata.title}`);
  if (metadata.document_number) parts.push(`Số hiệu: ${metadata.document_number}`);
  if (metadata.issue_date) parts.push(`Ngày ban hành: ${metadata.issue_date}`);
  if (metadata.issuer) parts.push(`Cơ quan: ${metadata.issuer}`);
  if (metadata.recipient) parts.push(`Đối tượng: ${metadata.recipient}`);
  if (metadata.document_type && metadata.document_type !== "unknown") parts.push(`Loại tài liệu: ${metadata.document_type}`);
  if (metadata.keywords?.length) parts.push(`Từ khóa: ${metadata.keywords.join(", ")}`);
  if (metadata.page_count) parts.push(`Số trang: ${metadata.page_count}`);
  if (metadata.structure?.headings?.length) parts.push(`Mục nổi bật: ${metadata.structure.headings.slice(0, 3).join(" | ")}`);
  return parts.length > 0 ? `Metadata: ${parts.join(" | ")}` : null;
}

function scoreEntry(queryText, queryEmbedding, entry) {
  const semanticScore = cosineSimilarity(queryEmbedding, entry.embedding);
  const keywords = tokenizeSearchTerms(queryText);
  const chunkText = normalizeForSearch(entry.chunk);
  const metadataText = normalizeForSearch(JSON.stringify(entry.documentMetadata ?? {}));

  let chunkHits = 0;
  let metadataHits = 0;
  for (const keyword of keywords) {
    if (chunkText.includes(keyword)) chunkHits += 1;
    if (metadataText.includes(keyword)) metadataHits += 1;
  }

  const lexicalScore = keywords.length > 0 ? chunkHits / keywords.length : 0;
  const metadataScore = keywords.length > 0 ? metadataHits / keywords.length : 0;
  const titleMatch = entry.documentMetadata?.title
    ? normalizeForSearch(entry.documentMetadata.title).includes(normalizeForSearch(queryText))
    : false;
  const exactDocMatch =
    entry.documentMetadata?.document_number &&
    normalizeForSearch(queryText).includes(normalizeForSearch(entry.documentMetadata.document_number));

  const score = (semanticScore * 0.58) + (lexicalScore * 0.26) + (metadataScore * 0.12) + (titleMatch ? 0.06 : 0) + (exactDocMatch ? 0.08 : 0);

  return {
    score,
    semantic_score: semanticScore,
    lexical_score: lexicalScore,
    metadata_score: metadataScore,
  };
}

function extractMetadataText(metadata) {
  if (!metadata) return "";
  const parts = [
    metadata.title,
    metadata.document_number,
    metadata.issue_date,
    metadata.issuer,
    metadata.recipient,
    metadata.subject,
    metadata.document_type,
    ...(metadata.keywords ?? []),
    ...(metadata.structure?.headings ?? []),
  ];
  return normalizeForSearch(parts.filter(Boolean).join(" "));
}

function countMatches(text, terms) {
  const normalized = normalizeForSearch(text);
  if (!normalized || !terms?.length) return 0;
  let matches = 0;
  for (const term of terms) {
    if (normalized.includes(normalizeForSearch(term))) matches += 1;
  }
  return matches;
}

function rerankCandidates(entries, plan, queryText) {
  const focusTerms = unique([
    ...(plan.focus_terms ?? []),
    ...tokenizeSearchTerms(queryText),
  ]).slice(0, 12);
  const expectedFields = new Set(plan.expected_fields ?? []);

  return entries.map((entry) => {
    const metadataText = extractMetadataText(entry.documentMetadata);
    const titleHits = countMatches(entry.documentMetadata?.title ?? "", focusTerms);
    const subjectHits = countMatches(entry.documentMetadata?.subject ?? "", focusTerms);
    const issuerHits = countMatches(entry.documentMetadata?.issuer ?? "", focusTerms);
    const recipientHits = countMatches(entry.documentMetadata?.recipient ?? "", focusTerms);
    const headingHits = countMatches((entry.documentMetadata?.structure?.headings ?? []).join(" "), focusTerms);
    const chunkHits = countMatches(entry.chunk, focusTerms);

    let rerankBoost = 0;
    rerankBoost += Math.min(titleHits, 3) * 0.03;
    rerankBoost += Math.min(subjectHits, 3) * 0.025;
    rerankBoost += Math.min(issuerHits + recipientHits, 3) * 0.02;
    rerankBoost += Math.min(headingHits, 4) * 0.02;
    rerankBoost += Math.min(chunkHits, 5) * 0.015;

    if (entry.documentMetadata?.document_type && expectedFields.has("document_type")) {
      rerankBoost += entry.documentMetadata.document_type !== "unknown" ? 0.03 : 0;
    }
    if (entry.documentMetadata?.document_number && expectedFields.has("document_number")) rerankBoost += 0.03;
    if (entry.documentMetadata?.issue_date && expectedFields.has("issue_date")) rerankBoost += 0.02;
    if (entry.documentMetadata?.issuer && expectedFields.has("issuer")) rerankBoost += 0.02;
    if (entry.documentMetadata?.recipient && expectedFields.has("recipient")) rerankBoost += 0.02;
    if (entry.documentMetadata?.subject && expectedFields.has("subject")) rerankBoost += 0.02;

    const documentType = entry.documentMetadata?.document_type ?? "unknown";
    if (documentType !== "unknown" && normalizeForSearch(queryText).includes(normalizeForSearch(documentType))) {
      rerankBoost += 0.04;
    }

    return {
      ...entry,
      rerank_score: entry.score + rerankBoost,
      rerank_boost: rerankBoost,
      metadata_snapshot: metadataText.slice(0, 500),
    };
  }).sort((left, right) => right.rerank_score - left.rerank_score);
}

function selectCitationChunks(entries, limit) {
  const selected = [];
  const perDocument = new Map();

  for (const entry of entries) {
    const docKey = entry.documentId ?? entry.fileId ?? entry.sourcePath ?? entry.source;
    const count = perDocument.get(docKey) ?? 0;
    const maxPerDocument = 1;
    if (count >= maxPerDocument) continue;
    perDocument.set(docKey, count + 1);
    selected.push(entry);
    if (selected.length >= limit) break;
  }

  return selected;
}

function buildCitationWindow(entry, pool, radius = 1) {
  const docKey = entry.documentId ?? entry.fileId ?? entry.sourcePath ?? entry.source;
  const baseIndex = entry.chunkIndex ?? 0;
  const related = pool
    .filter((candidate) => {
      const candidateKey = candidate.documentId ?? candidate.fileId ?? candidate.sourcePath ?? candidate.source;
      return candidateKey === docKey && Math.abs((candidate.chunkIndex ?? 0) - baseIndex) <= radius;
    })
    .sort((left, right) => (left.chunkIndex ?? 0) - (right.chunkIndex ?? 0));
  const excerpt = related.map((candidate) => candidate.chunk).join("\n");
  return {
    excerpt: excerpt.slice(0, 1200),
    related_chunk_indexes: related.map((candidate) => candidate.chunkIndex ?? null),
  };
}

async function retrieve(queryText, topK) {
  const index = loadIndex();
  if (index.length === 0) {
    return {
      query: queryText,
      query_plan: { original_query: queryText, expanded_queries: [queryText], focus_terms: [], expected_fields: [] },
      results: [],
      selected: [],
      warnings: [],
      fallback: false,
      fallback_mode: null,
      note: "Knowledge base trống. Chạy --build hoặc --add trước.",
    };
  }

  const topKNum = topK ?? CONFIG.topK;
  const plan = await rewriteQueryPlan(queryText);
  const scoredSets = [];
  for (const variant of plan.expanded_queries) {
    const queryEmbedding = await embed(variant);
    const scored = index
      .map((entry) => ({
        ...entry,
        ...scoreEntry(variant, queryEmbedding, entry),
        matched_query: variant,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(topKNum * 4, CONFIG.maxContextChunks * 2));
    scoredSets.push(scored);
  }

  const scoredAll = mergeRankedCandidates(scoredSets, Math.max(topKNum * 4, CONFIG.maxContextChunks * 2));
  const rerankedAll = rerankCandidates(scoredAll, plan, queryText);
  let selected = rerankedAll.filter((e) => e.rerank_score >= CONFIG.similarityThreshold);
  let usedFallback = false;
  let fallbackMode = null;

  if (selected.length === 0 && CONFIG.allowFallback) {
    const lexical = lexicalFallback(queryText, index);
    if (lexical.length > 0) {
      selected = rerankCandidates(lexical, plan, queryText).slice(0, Math.max(CONFIG.lexicalTopK || 1, CONFIG.maxContextChunks));
      usedFallback = true;
      fallbackMode = "lexical";
    } else if (rerankedAll.length > 0) {
      selected = [rerankedAll[0]];
      usedFallback = true;
      fallbackMode = "embedding";
    }
  }

  if (selected.length > 1) {
    const bestScore = selected[0]?.rerank_score ?? selected[0]?.score ?? 0;
    const scoreFloor = bestScore * 0.9;
    selected = selected.filter((entry, index) => index === 0 || (entry.rerank_score ?? entry.score ?? 0) >= scoreFloor);
  }

  selected = selectCitationChunks(selected, Math.max(topKNum, CONFIG.maxContextChunks));

  const warnings = [];
  if (usedFallback) {
    warnings.push(
      fallbackMode === "lexical"
        ? "Fallback: ket qua lay theo tu khoa (do tin cay thap)."
        : "Fallback: ket qua gan nhat theo embedding (do tin cay thap)."
    );
  }

  return {
    query: queryText,
    query_plan: plan,
    selected,
    candidate_pool: rerankedAll,
    warnings,
    fallback: usedFallback,
    fallback_mode: fallbackMode,
    note: selected.length === 0 ? "Không tìm thấy thông tin liên quan trong knowledge base." : undefined,
  };
}

function parseJsonBlock(text) {
  const trimmed = String(text ?? "").trim();
  const fenced = trimmed.match(/```json\s*([\s\S]*?)```/i)?.[1] ?? trimmed;
  const candidate = fenced.match(/\{[\s\S]*\}/)?.[0];
  if (!candidate) return null;
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

async function rewriteQueryPlan(queryText) {
  if (!CONFIG.queryRewrite || !CONFIG.enableGeneration) {
    return {
      original_query: queryText,
      expanded_queries: [queryText],
      focus_terms: tokenizeSearchTerms(queryText).slice(0, 8),
      expected_fields: [],
    };
  }

  try {
    const raw = await generate(
      "Bạn là bộ lập kế hoạch truy hồi cho knowledge base hành chính. Trả về JSON hợp lệ בלבד, không giải thích.",
      `Hãy phân tích câu hỏi sau và tạo kế hoạch truy hồi.\nCâu hỏi: ${queryText}\n\nTrả về JSON với các trường:\n- original_query: string\n- expanded_queries: string[] (tối đa ${CONFIG.queryVariants})\n- focus_terms: string[]\n- expected_fields: string[] (ví dụ: document_number, issue_date, issuer, recipient, subject, document_type)\n- retrieval_hint: string`
    );
    const plan = parseJsonBlock(raw);
    if (!plan || !Array.isArray(plan.expanded_queries)) throw new Error("Invalid rewrite plan");
    return {
      original_query: queryText,
      expanded_queries: unique([queryText, ...plan.expanded_queries]).slice(0, Math.max(1, CONFIG.queryVariants)),
      focus_terms: Array.isArray(plan.focus_terms) ? unique(plan.focus_terms).slice(0, 12) : tokenizeSearchTerms(queryText).slice(0, 8),
      expected_fields: Array.isArray(plan.expected_fields) ? unique(plan.expected_fields).slice(0, 8) : [],
      retrieval_hint: typeof plan.retrieval_hint === "string" ? plan.retrieval_hint : undefined,
    };
  } catch {
    const terms = tokenizeSearchTerms(queryText);
    const expanded = unique([
      queryText,
      terms.join(" "),
      terms.slice(0, 6).join(" "),
    ]).slice(0, Math.max(1, CONFIG.queryVariants));
    return {
      original_query: queryText,
      expanded_queries: expanded,
      focus_terms: terms.slice(0, 8),
      expected_fields: [],
      retrieval_hint: "heuristic",
    };
  }
}

// ── Add document ──────────────────────────────────────────────────────────────
async function addDocument(filePath) {
  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) throw new Error(`File không tồn tại: ${absPath}`);

  console.error(`📥 Đang thêm: ${absPath}`);
  const raw = await readDocumentText(absPath);
  const text = normalizeText(raw.text);
  if (!text || text.trim().length === 0) {
    throw new Error("Không đọc được text từ file. Nếu là scan, cần OCR hoặc file có text.");
  }
  const { chunkSize, chunkOverlap, chunkMinChars, chunkMax } = resolveChunkConfig();
  let chunks = chunkText(text, chunkSize, chunkOverlap).filter((chunk) => chunk.length >= chunkMinChars);
  if (chunkMax && chunks.length > chunkMax) chunks = chunks.slice(0, chunkMax);
  const index = loadIndex();
  const fileId = createHash("md5").update(absPath).digest("hex");
  const contentHash = createHash("sha256").update(text).digest("hex");
  const sourceFile = path.basename(filePath);
  const sourceLabel = args["display-name"] ?? inferTitle(text) ?? sourceFile;
  const documentMetadata = extractDocumentMetadata(text, absPath, { pageCount: raw.pageCount ?? null, sourceLabel });

  // Remove existing entries for this file
  const filtered = index.filter(
    (e) => e.fileId !== fileId && e.contentHash !== contentHash && e.sourcePath !== absPath
  );

  const pendingChunks = [];
  for (let i = 0; i < chunks.length; i++) {
    process.stderr.write(`  Chunk ${i + 1}/${chunks.length}...\r`);
    const embedding = await embed(chunks[i]);
    pendingChunks.push({
      source: sourceLabel,
      sourceLabel,
      sourceFile,
      sourcePath: absPath,
      contentHash,
      addedAt: new Date().toISOString(),
      chunkIndex: i,
      chunk: chunks[i],
      documentMetadata,
      embedding,
    });
  }

  const db = getDatabase();
  const document = db.transaction(() => {
    const stored = storeDocument(db, {
      filePath: absPath,
      fileName: sourceFile,
      fileHash: fileHash(absPath),
      source: "knowledge-base",
    });
    storeExtraction(db, {
      documentId: stored.id,
      method: raw.method ?? "native-text",
      text,
      metadata: {
        document: documentMetadata,
        indexing: {
          sourceLabel,
          chunkCount: chunks.length,
          chunkSize,
          chunkOverlap,
          chunkMinChars,
        },
      },
      pageCount: raw.pageCount ?? null,
      confidence: raw.method === "native-text" ? 0.92 : 0.78,
    });
    const nextIndex = [...filtered, ...pendingChunks.map((entry) => ({ fileId, documentId: stored.id, ...entry }))];
    saveIndex(nextIndex);
    return stored;
  })();
  db.close();
  console.error(`\n✅ Đã lập chỉ mục ${chunks.length} đoạn từ ${sourceLabel}`);
  return { document_id: document.id, source: sourceLabel, chunks_indexed: chunks.length };
}

async function addDirectory(dirPath) {
  const absDir = path.resolve(dirPath);
  const files = fs
    .readdirSync(absDir)
    .filter((f) => [".pdf", ".docx", ".txt", ".md"].includes(path.extname(f).toLowerCase()))
    .map((f) => path.join(absDir, f));

  console.error(`📂 Tìm thấy ${files.length} file trong ${absDir}`);
  const documents = [];
  for (const file of files) documents.push(await addDocument(file));
  return documents;
}

function getIndexStats(index) {
  const raw = readRawIndex();
  const docs = new Map();
  for (const entry of index) {
    const key = entry.contentHash ?? entry.fileId ?? entry.sourcePath ?? entry.source;
    const existing = docs.get(key);
    if (existing) {
      existing.chunks += 1;
    } else {
      docs.set(key, {
        sourceLabel: entry.sourceLabel ?? entry.source ?? entry.sourceFile,
        sourcePath: entry.sourcePath,
        chunks: 1,
        addedAt: entry.addedAt,
      });
    }
  }

  return {
    schema_version: raw.schema_version,
    created_at: raw.created_at,
    updated_at: raw.updated_at,
    documents: docs.size,
    chunks: index.length,
    bySource: Array.from(docs.values()).sort((a, b) => b.chunks - a.chunks),
  };
}

function lexicalFallback(queryText, entries) {
  const normalizedQuery = normalizeForSearch(queryText);
  const keywords = normalizedQuery
    .split(/\s+/)
    .filter((word) => word.length >= 3);

  if (keywords.length === 0) return [];

  return entries
    .map((entry) => {
      const chunkNorm = normalizeForSearch(entry.chunk);
      let hits = 0;
      for (const keyword of keywords) {
        if (chunkNorm.includes(keyword)) hits += 1;
      }
      return {
        ...entry,
        score: hits / keywords.length,
        semantic_score: 0,
        lexical_score: hits / keywords.length,
        metadata_score: 0,
        lexicalHits: hits,
      };
    })
    .filter((entry) => entry.lexicalHits > 0)
    .sort((a, b) => b.lexicalHits - a.lexicalHits);
}

function mergeRankedCandidates(scoredSets, topK) {
  const merged = new Map();
  for (const set of scoredSets) {
    for (const candidate of set) {
      const key = `${candidate.documentId ?? ""}:${candidate.fileId ?? ""}:${candidate.chunkIndex ?? 0}:${candidate.chunk ?? ""}`;
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, { ...candidate, query_matches: 1, score_sum: candidate.score, score_max: candidate.score });
      } else {
        existing.query_matches += 1;
        existing.score_sum += candidate.score;
        existing.score_max = Math.max(existing.score_max, candidate.score);
        existing.score = Math.max(existing.score, candidate.score);
        existing.semantic_score = Math.max(existing.semantic_score ?? 0, candidate.semantic_score ?? 0);
        existing.lexical_score = Math.max(existing.lexical_score ?? 0, candidate.lexical_score ?? 0);
        existing.metadata_score = Math.max(existing.metadata_score ?? 0, candidate.metadata_score ?? 0);
      }
    }
  }

  return Array.from(merged.values())
    .map((entry) => ({
      ...entry,
      score: (entry.score_max * 0.7) + ((entry.score_sum / entry.query_matches) * 0.3),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

// ── Query ─────────────────────────────────────────────────────────────────────
async function query(queryText, topK) {
  const retrieved = await retrieve(queryText, topK);
  if (!retrieved.selected?.length) {
    return { query: queryText, results: [], answer: retrieved.note ?? "Không tìm thấy thông tin liên quan trong knowledge base." };
  }
  const selected = retrieved.selected;
  const warnings = retrieved.warnings ?? [];

  // Generate answer using retrieved context
  const context = selected
    .map((e, i) => {
      const label = e.sourceLabel ?? e.source;
      const metadataLine = metadataToContext(e.documentMetadata);
      const window = buildCitationWindow(e, retrieved.candidate_pool ?? selected, 1);
      return [
        `[${i + 1}] Nguồn: ${label}`,
        metadataLine ? metadataLine : null,
        `Điểm: ${e.rerank_score.toFixed(3)} | Base: ${e.score.toFixed(3)} | Semantic: ${e.semantic_score.toFixed(3)} | Lexical: ${e.lexical_score.toFixed(3)} | Metadata: ${e.metadata_score.toFixed(3)} | Boost: ${e.rerank_boost.toFixed(3)}`,
        window.excerpt,
      ].filter(Boolean).join("\n");
    })
    .join("\n\n---\n\n");

  let answer = null;
  if (CONFIG.enableGeneration) {
    answer = await generate(
      `Bạn là trợ lý hành chính, chuyên trả lời câu hỏi dựa trên các văn bản pháp lý và tài liệu nội bộ được cung cấp.
Trả lời bằng tiếng Việt, chính xác, trích dẫn nguồn cụ thể.
Nếu thông tin không đủ, nói rõ giới hạn.`,
      `Câu hỏi: ${queryText}\n\nTài liệu tham khảo:\n${context}`
    );
  }

  return {
    query: queryText,
    query_plan: retrieved.query_plan,
    results: selected.map(({ embedding: _e, score_sum, score_max, query_matches, lexicalHits, ...rest }) => rest),
    answer,
    answer_policy: CONFIG.strictAnswer ? "strict" : "default",
    answer_guidelines: CONFIG.strictAnswer
      ? "Chi tra loi tu results; neu khong co, hay noi khong tim thay trong knowledge base; luon trich dan nguon."
      : undefined,
    citation_required: true,
    citation_pack: selected.map((entry, index) => {
      const window = buildCitationWindow(entry, retrieved.candidate_pool ?? selected, 1);
      return {
      rank: index + 1,
      source_label: entry.sourceLabel ?? entry.source,
      source_file: entry.sourceFile,
      page_count: entry.documentMetadata?.page_count ?? null,
      document_number: entry.documentMetadata?.document_number ?? null,
      issue_date: entry.documentMetadata?.issue_date ?? null,
      document_type: entry.documentMetadata?.document_type ?? null,
      title: entry.documentMetadata?.title ?? null,
      subject: entry.documentMetadata?.subject ?? null,
      issuer: entry.documentMetadata?.issuer ?? null,
      recipient: entry.documentMetadata?.recipient ?? null,
      headings: entry.documentMetadata?.structure?.headings ?? [],
      chunk_index: entry.chunkIndex ?? null,
      score: Number(entry.rerank_score.toFixed(4)),
      base_score: Number(entry.score.toFixed(4)),
      semantic_score: Number(entry.semantic_score.toFixed(4)),
      lexical_score: Number(entry.lexical_score.toFixed(4)),
      metadata_score: Number(entry.metadata_score.toFixed(4)),
      rerank_boost: Number(entry.rerank_boost.toFixed(4)),
      matched_query: entry.matched_query ?? queryText,
      excerpt: window.excerpt,
      related_chunk_indexes: window.related_chunk_indexes,
    };
    }),
    fallback: retrieved.fallback,
    fallback_mode: retrieved.fallback_mode,
    fallback_note: retrieved.fallback
      ? retrieved.fallback_mode === "lexical"
        ? "Khong co ket qua dat nguong; tra ve ket qua theo tu khoa (do tin cay thap)."
        : "Khong co ket qua dat nguong; dang tra ve ket qua gan nhat (do tin cay thap)."
      : undefined,
    warnings: warnings.length > 0 ? warnings : undefined,
    note: CONFIG.enableGeneration
      ? undefined
      : "Retrieval-only: hay dung results de LLM trong OpenClaw tra loi.",
  };
}

function loadBenchmarkSuite(filePath) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Benchmark file not found: ${resolved}`);
  }
  const suite = JSON.parse(fs.readFileSync(resolved, "utf8"));
  if (!Array.isArray(suite.cases)) {
    throw new Error("Benchmark suite must contain a cases array");
  }
  return { ...suite, resolvedPath: resolved };
}

function matchesCaseExpectation(citation, expectation) {
  if (!expectation) return false;
  const haystacks = [
    citation.source_file,
    citation.document_number,
    citation.document_type,
    citation.title,
    citation.subject,
    citation.issuer,
    citation.recipient,
    citation.headings?.join(" "),
    citation.excerpt,
  ]
    .filter(Boolean)
    .map((value) => normalizeForSearch(String(value)));

  const matchAny = (terms) =>
    (terms ?? []).some((term) => {
      const needle = normalizeForSearch(term);
      return haystacks.some((haystack) => haystack.includes(needle));
    });

  if (expectation.source_file && normalizeForSearch(citation.source_file ?? "") !== normalizeForSearch(expectation.source_file)) {
    return false;
  }
  if (expectation.document_type && normalizeForSearch(citation.document_type ?? "") !== normalizeForSearch(expectation.document_type)) {
    return false;
  }
  if (expectation.document_number && !normalizeForSearch(citation.document_number ?? "").includes(normalizeForSearch(expectation.document_number))) {
    return false;
  }
  if (expectation.must_include_terms && !matchAny(expectation.must_include_terms)) {
    return false;
  }
  if (expectation.must_include_headings && !matchAny(expectation.must_include_headings)) {
    return false;
  }
  return true;
}

function scoreCitationCoverage(citation, expectations = {}) {
  const checks = [
    expectations.source_file ? normalizeForSearch(citation.source_file ?? "") === normalizeForSearch(expectations.source_file) : null,
    expectations.document_type ? normalizeForSearch(citation.document_type ?? "") === normalizeForSearch(expectations.document_type) : null,
    expectations.document_number ? normalizeForSearch(citation.document_number ?? "").includes(normalizeForSearch(expectations.document_number)) : null,
    expectations.must_include_terms ? expectations.must_include_terms.some((term) => normalizeForSearch(citation.excerpt ?? "").includes(normalizeForSearch(term))) : null,
    expectations.must_include_headings ? expectations.must_include_headings.some((term) => normalizeForSearch((citation.headings ?? []).join(" ")).includes(normalizeForSearch(term))) : null,
  ].filter((value) => value !== null);

  if (checks.length === 0) return 0;
  const passCount = checks.filter(Boolean).length;
  return passCount / checks.length;
}

async function runBenchmarkSuite(filePath) {
  const suite = loadBenchmarkSuite(filePath);
  const cases = suite.cases;
  const results = [];

  for (const benchmarkCase of cases) {
    const retrieved = await retrieve(benchmarkCase.query, benchmarkCase.top_k ?? CONFIG.topK);
    const citations = retrieved.selected.map((entry, index) => ({
      ...{
        rank: index + 1,
        source_file: entry.sourceFile,
        document_type: entry.documentMetadata?.document_type ?? null,
        document_number: entry.documentMetadata?.document_number ?? null,
        title: entry.documentMetadata?.title ?? null,
        subject: entry.documentMetadata?.subject ?? null,
        issuer: entry.documentMetadata?.issuer ?? null,
        recipient: entry.documentMetadata?.recipient ?? null,
        headings: entry.documentMetadata?.structure?.headings ?? [],
        score: Number(entry.rerank_score.toFixed(4)),
      },
    }));
    const enhancedCitations = retrieved.selected.map((entry, index) => {
      const window = buildCitationWindow(entry, retrieved.candidate_pool ?? retrieved.selected, 1);
      return {
        ...citations[index],
        excerpt: window.excerpt,
        related_chunk_indexes: window.related_chunk_indexes,
      };
    });
    const firstRelevantIndex = enhancedCitations.findIndex((citation) => matchesCaseExpectation(citation, benchmarkCase.expectation));
    const topCitation = enhancedCitations[0] ?? null;
    const coverage = topCitation ? scoreCitationCoverage(topCitation, benchmarkCase.expectation) : 0;
    const reciprocalRank = firstRelevantIndex >= 0 ? 1 / (firstRelevantIndex + 1) : 0;
    const pass = firstRelevantIndex >= 0 && (benchmarkCase.max_rank ? (firstRelevantIndex + 1) <= benchmarkCase.max_rank : true);

    results.push({
      id: benchmarkCase.id ?? benchmarkCase.query,
      query: benchmarkCase.query,
      pass,
      first_relevant_rank: firstRelevantIndex >= 0 ? firstRelevantIndex + 1 : null,
      reciprocal_rank: Number(reciprocalRank.toFixed(4)),
      top1_coverage: Number(coverage.toFixed(4)),
      citation_precision: Number((enhancedCitations.filter((citation) => matchesCaseExpectation(citation, benchmarkCase.expectation)).length / Math.max(enhancedCitations.length, 1)).toFixed(4)),
      selected_count: enhancedCitations.length,
      retrieved_fallback: retrieved.fallback,
      retrieved_fallback_mode: retrieved.fallback_mode,
      expected: benchmarkCase.expectation,
      top_citation: topCitation,
    });
  }

  const total = results.length;
  const passed = results.filter((entry) => entry.pass).length;
  const meanRr = total ? results.reduce((sum, entry) => sum + entry.reciprocal_rank, 0) / total : 0;
  const meanCoverage = total ? results.reduce((sum, entry) => sum + entry.top1_coverage, 0) / total : 0;
  const meanCitationPrecision = total ? results.reduce((sum, entry) => sum + entry.citation_precision, 0) / total : 0;

  return {
    benchmark: suite.name ?? path.basename(filePath),
    source: suite.source ?? null,
    total_cases: total,
    passed_cases: passed,
    pass_rate: total ? Number((passed / total).toFixed(4)) : 0,
    mean_reciprocal_rank: Number(meanRr.toFixed(4)),
    mean_top1_coverage: Number(meanCoverage.toFixed(4)),
    mean_citation_precision: Number(meanCitationPrecision.toFixed(4)),
    cases: results,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  try {
    if (args["migrate-index"]) {
      printEnvelope(SKILL, migrateIndex());
      return;
    }
    if (args.eval) {
      const benchmarkFile = args.benchmark ?? CONFIG.benchmarkFile;
      printEnvelope(SKILL, await runBenchmarkSuite(benchmarkFile));
      return;
    }
    if (args.stats) {
      const index = loadIndex();
      printEnvelope(SKILL, getIndexStats(index));
      return;
    }
    if (args.reset) {
      resetIndex();
      printEnvelope(SKILL, { message: "Đã reset index" });
      return;
    }
    if (args.remove) {
      if (!args.label && !args.file) {
        throw new Error("--remove yêu cầu --label hoặc --file");
      }
      const result = removeEntries({ label: args.label, file: args.file });
      printEnvelope(SKILL, result);
      return;
    }
    if (args.build) {
      const source = args.source ?? CONFIG.dataDir;
      printEnvelope(SKILL, await addDirectory(source));
    } else if (args.add) {
      if (args.file) printEnvelope(SKILL, await addDocument(args.file));
      else if (args.dir) printEnvelope(SKILL, await addDirectory(args.dir));
      else throw new Error("--add yêu cầu --file hoặc --dir");
    } else if (args.query) {
      const topK = args["top-k"] ? parseInt(args["top-k"]) : undefined;
      printEnvelope(SKILL, await query(args.query, topK));
    } else {
      console.error("Thiếu tham số. Dùng --help để xem hướng dẫn.");
      process.exit(1);
    }
  } catch (err) {
    printError(SKILL, err);
    process.exitCode = 1;
  }
}

main();
