#!/usr/bin/env node
/**
 * rag.js — Retrieval-Augmented Generation cho knowledge base nội bộ
 * US-08: Tra cứu văn bản, quy định từ kho tài liệu
 */

import fs from "fs";
import path from "path";
import { parseArgs } from "util";
import { createHash } from "crypto";

// ── Config ────────────────────────────────────────────────────────────────────
const CONFIG = {
  apiKey: process.env.OPENAI_API_KEY,
  embeddingModel: process.env.EMBEDDING_MODEL ?? "text-embedding-3-small",
  generationModel: process.env.GENERATION_MODEL ?? "gpt-4o-mini",
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
    file: { type: "string", short: "f" },
    dir: { type: "string", short: "d" },
    source: { type: "string", short: "s" },
    "top-k": { type: "string" },
    help: { type: "boolean", short: "h" },
  },
  strict: false,
});

if (args.help) {
  console.log(`
Sử dụng:
  node rag.js --query "câu hỏi"
  node rag.js --add --file path/to/file.pdf
  node rag.js --add --dir path/to/directory
  node rag.js --build --source path/to/documents

Biến môi trường:
  OPENAI_API_KEY          (bắt buộc)
  EMBEDDING_MODEL         (mặc định: text-embedding-3-small)
  GENERATION_MODEL        (mặc định: gpt-4o-mini)
  KB_DATA_DIR             (mặc định: ./data/knowledge-base)
  KB_INDEX_DIR            (mặc định: ./data/kb-index)
  SIMILARITY_THRESHOLD    (mặc định: 0.75)
  TOP_K                   (mặc định: 5)
`);
  process.exit(0);
}

// ── OpenAI client helpers ─────────────────────────────────────────────────────
async function getOpenAI() {
  const { default: OpenAI } = await import("openai").catch(() => {
    throw new Error("Cần cài đặt: npm install openai");
  });
  if (!CONFIG.apiKey) throw new Error("Thiếu OPENAI_API_KEY");
  return new OpenAI({ apiKey: CONFIG.apiKey });
}

async function embed(text) {
  const openai = await getOpenAI();
  const response = await openai.embeddings.create({
    model: CONFIG.embeddingModel,
    input: text.slice(0, 8000),
  });
  return response.data[0].embedding;
}

async function generate(systemPrompt, userPrompt) {
  const openai = await getOpenAI();
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
  const text = await readFileText(absPath);
  const chunks = chunkText(text);
  const index = loadIndex();
  const fileId = createHash("md5").update(absPath).digest("hex");

  // Remove existing entries for this file
  const filtered = index.filter((e) => e.fileId !== fileId);

  for (let i = 0; i < chunks.length; i++) {
    process.stderr.write(`  Chunk ${i + 1}/${chunks.length}...\r`);
    const embedding = await embed(chunks[i]);
    filtered.push({
      fileId,
      source: path.basename(filePath),
      sourcePath: absPath,
      chunkIndex: i,
      chunk: chunks[i],
      embedding,
    });
  }

  saveIndex(filtered);
  console.error(`\n✅ Đã lập chỉ mục ${chunks.length} đoạn từ ${path.basename(filePath)}`);
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

// ── Query ─────────────────────────────────────────────────────────────────────
async function query(queryText, topK) {
  const index = loadIndex();
  if (index.length === 0) {
    console.log(JSON.stringify({ error: "Knowledge base trống. Chạy --build hoặc --add trước." }));
    return;
  }

  const queryEmbedding = await embed(queryText);
  const topKNum = topK ?? CONFIG.topK;

  const scored = index
    .map((entry) => ({
      ...entry,
      score: cosineSimilarity(queryEmbedding, entry.embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topKNum)
    .filter((e) => e.score >= CONFIG.similarityThreshold);

  if (scored.length === 0) {
    console.log(
      JSON.stringify({
        query: queryText,
        results: [],
        answer: "Không tìm thấy thông tin liên quan trong knowledge base.",
      }, null, 2)
    );
    return;
  }

  // Generate answer using retrieved context
  const context = scored
    .map((e, i) => `[${i + 1}] Nguồn: ${e.source}\n${e.chunk}`)
    .join("\n\n---\n\n");

  const answer = await generate(
    `Bạn là trợ lý hành chính, chuyên trả lời câu hỏi dựa trên các văn bản pháp lý và tài liệu nội bộ được cung cấp.
Trả lời bằng tiếng Việt, chính xác, trích dẫn nguồn cụ thể.
Nếu thông tin không đủ, nói rõ giới hạn.`,
    `Câu hỏi: ${queryText}\n\nTài liệu tham khảo:\n${context}`
  );

  console.log(
    JSON.stringify(
      {
        query: queryText,
        results: scored.map(({ embedding: _e, ...rest }) => rest),
        answer,
      },
      null,
      2
    )
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  try {
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
