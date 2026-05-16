#!/usr/bin/env node
/**
 * rag.js — Retrieval-Augmented Generation cho knowledge base nội bộ
 * US-08: Tra cứu văn bản, quy định từ kho tài liệu
 */

import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { parseArgs } from "util";

// ── Config ────────────────────────────────────────────────────────────────────
const CONFIG = {
  apiKey: process.env.OPENAI_API_KEY,
  openaiBaseUrl: process.env.OPENAI_BASE_URL ?? process.env.OPENAI_API_BASE,
  embeddingModel: process.env.EMBEDDING_MODEL ?? "text-embedding-3-small",
  generationModel: process.env.GENERATION_MODEL ?? "gpt-4o-mini",
  embeddingProvider: (process.env.EMBEDDING_PROVIDER ?? "openai").toLowerCase(),
  ollamaHost: process.env.OLLAMA_HOST ?? "http://localhost:11434",
  ollamaEmbeddingModel: process.env.OLLAMA_EMBEDDING_MODEL ?? "nomic-embed-text",
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
  OPENAI_API_KEY          (bắt buộc nếu dùng openai)
  OPENAI_BASE_URL         (dùng cho OpenAI-compatible như LM Studio)
  EMBEDDING_MODEL         (mặc định: text-embedding-3-small)
  GENERATION_MODEL        (mặc định: gpt-4o-mini)
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
  KB_DATA_DIR             (mặc định: ./data/knowledge-base)
  KB_INDEX_DIR            (mặc định: ./data/kb-index)
  SIMILARITY_THRESHOLD    (mặc định: 0.75)
  TOP_K                   (mặc định: 5)
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
  const openai = await getOpenAI({ requireKey: CONFIG.embeddingProvider === "openai" });
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

function loadIndex() {
  if (!fs.existsSync(INDEX_FILE)) return [];
  return JSON.parse(fs.readFileSync(INDEX_FILE, "utf8"));
}

function saveIndex(index) {
  fs.mkdirSync(CONFIG.indexDir, { recursive: true });
  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2), "utf8");
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
function chunkText(text, chunkSize = 500, overlap = 100) {
  const sentences = text.split(/(?<=[.!?。\n])\s+/);
  const chunks = [];
  let current = "";

  for (const sentence of sentences) {
    if ((current + " " + sentence).length > chunkSize && current.length > 0) {
      chunks.push(current.trim());
      // Overlap: keep last portion
      const words = current.split(" ");
      current = words.slice(-Math.floor(overlap / 10)).join(" ") + " " + sentence;
    } else {
      current += (current ? " " : "") + sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());
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

// ── File reading (reuse approach from cong-van-summary) ──────────────────────
async function readFileText(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".txt" || ext === ".md") {
    return fs.readFileSync(filePath, "utf8");
  }
  if (ext === ".pdf") {
    const { default: pdfParse } = await import("pdf-parse").catch(() => {
      throw new Error("Cần cài đặt: npm install pdf-parse");
    });
    const data = await pdfParse(fs.readFileSync(filePath));
    return data.text;
  }
  if (ext === ".docx") {
    const mammoth = await import("mammoth").catch(() => {
      throw new Error("Cần cài đặt: npm install mammoth");
    });
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }
  throw new Error(`Định dạng không hỗ trợ: ${ext}`);
}

// ── Add document ──────────────────────────────────────────────────────────────
async function addDocument(filePath) {
  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) throw new Error(`File không tồn tại: ${absPath}`);

  console.error(`📥 Đang thêm: ${absPath}`);
  const rawText = await readFileText(absPath);
  const text = normalizeText(rawText);
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

  // Remove existing entries for this file
  const filtered = index.filter(
    (e) => e.fileId !== fileId && e.contentHash !== contentHash && e.sourcePath !== absPath
  );

  for (let i = 0; i < chunks.length; i++) {
    process.stderr.write(`  Chunk ${i + 1}/${chunks.length}...\r`);
    const embedding = await embed(chunks[i]);
    filtered.push({
      fileId,
      source: sourceLabel,
      sourceLabel,
      sourceFile,
      sourcePath: absPath,
      contentHash,
      addedAt: new Date().toISOString(),
      chunkIndex: i,
      chunk: chunks[i],
      embedding,
    });
  }

  saveIndex(filtered);
  console.error(`\n✅ Đã lập chỉ mục ${chunks.length} đoạn từ ${sourceLabel}`);
}

async function addDirectory(dirPath) {
  const absDir = path.resolve(dirPath);
  const files = fs
    .readdirSync(absDir)
    .filter((f) => [".pdf", ".docx", ".txt", ".md"].includes(path.extname(f).toLowerCase()))
    .map((f) => path.join(absDir, f));

  console.error(`📂 Tìm thấy ${files.length} file trong ${absDir}`);
  for (const file of files) {
    await addDocument(file);
  }
}

function getIndexStats(index) {
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
      return { ...entry, lexicalScore: hits };
    })
    .filter((entry) => entry.lexicalScore > 0)
    .sort((a, b) => b.lexicalScore - a.lexicalScore);
}

// ── Query ─────────────────────────────────────────────────────────────────────
async function query(queryText, topK) {
  const index = loadIndex();
  if (index.length === 0) {
    console.log(JSON.stringify({ error: "Knowledge base trống. Chạy --build hoặc --add trước." }));
    return;
  }

  const queryEmbedding = await embed(queryText);
  const topKNum = topK ?? CONFIG.topK;

  const scoredAll = index
    .map((entry) => ({
      ...entry,
      score: cosineSimilarity(queryEmbedding, entry.embedding),
    }))
    .sort((a, b) => b.score - a.score);

  const topKList = scoredAll.slice(0, topKNum);
  let selected = topKList.filter((e) => e.score >= CONFIG.similarityThreshold);
  let usedFallback = false;
  let fallbackMode = null;

  if (selected.length === 0 && CONFIG.allowFallback) {
    const lexical = lexicalFallback(queryText, index);
    if (lexical.length > 0) {
      selected = lexical.slice(0, CONFIG.lexicalTopK || 1);
      usedFallback = true;
      fallbackMode = "lexical";
    } else if (topKList.length > 0) {
      selected = [topKList[0]];
      usedFallback = true;
      fallbackMode = "embedding";
    }
  }

  if (selected.length === 0) {
    console.log(
      JSON.stringify({
        query: queryText,
        results: [],
        answer: "Không tìm thấy thông tin liên quan trong knowledge base.",
      }, null, 2)
    );
    return;
  }

  const warnings = [];
  if (usedFallback) {
    warnings.push(
      fallbackMode === "lexical"
        ? "Fallback: ket qua lay theo tu khoa (do tin cay thap)."
        : "Fallback: ket qua gan nhat theo embedding (do tin cay thap)."
    );
  }

  // Generate answer using retrieved context
  const context = selected
    .map((e, i) => {
      const label = e.sourceLabel ?? e.source;
      return `[${i + 1}] Nguồn: ${label}\n${e.chunk}`;
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

  console.log(
    JSON.stringify(
      {
        query: queryText,
        results: selected.map(({ embedding: _e, ...rest }) => rest),
        answer,
        answer_policy: CONFIG.strictAnswer ? "strict" : "default",
        answer_guidelines: CONFIG.strictAnswer
          ? "Chi tra loi tu results; neu khong co, hay noi khong tim thay trong knowledge base; luon trich dan nguon."
          : undefined,
        citation_required: true,
        fallback: usedFallback,
        fallback_mode: fallbackMode,
        fallback_note: usedFallback
          ? fallbackMode === "lexical"
            ? "Khong co ket qua dat nguong; tra ve ket qua theo tu khoa (do tin cay thap)."
            : "Khong co ket qua dat nguong; dang tra ve ket qua gan nhat (do tin cay thap)."
          : undefined,
        warnings: warnings.length > 0 ? warnings : undefined,
        note: CONFIG.enableGeneration
          ? undefined
          : "Retrieval-only: hay dung results de LLM trong OpenClaw tra loi.",
      },
      null,
      2
    )
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  try {
    if (args.stats) {
      const index = loadIndex();
      console.log(JSON.stringify(getIndexStats(index), null, 2));
      return;
    }
    if (args.reset) {
      resetIndex();
      console.log(JSON.stringify({ ok: true, message: "Đã reset index" }, null, 2));
      return;
    }
    if (args.remove) {
      if (!args.label && !args.file) {
        throw new Error("--remove yêu cầu --label hoặc --file");
      }
      const result = removeEntries({ label: args.label, file: args.file });
      console.log(JSON.stringify({ ok: true, ...result }, null, 2));
      return;
    }
    if (args.build) {
      const source = args.source ?? CONFIG.dataDir;
      await addDirectory(source);
    } else if (args.add) {
      if (args.file) await addDocument(args.file);
      else if (args.dir) await addDirectory(args.dir);
      else throw new Error("--add yêu cầu --file hoặc --dir");
    } else if (args.query) {
      const topK = args["top-k"] ? parseInt(args["top-k"]) : undefined;
      await query(args.query, topK);
    } else {
      console.error("Thiếu tham số. Dùng --help để xem hướng dẫn.");
      process.exit(1);
    }
  } catch (err) {
    console.error(`❌ Lỗi: ${err.message}`);
    process.exit(1);
  }
}

main();
