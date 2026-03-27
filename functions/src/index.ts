import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PDFParse } from 'pdf-parse';
import dotenv from 'dotenv';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

dotenv.config();

admin.initializeApp();
const db = admin.firestore();

const RAG_INDEX_DOC_ID = 'default';
const RAG_INDEX_COLLECTION = 'rag_index';
const RAG_CHUNKS_COLLECTION = 'rag_chunks';

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY ?? 'put-your-gemini-api-key-here';
const EMBEDDING_MODELS = (process.env.GEMINI_EMBED_MODEL ?? 'gemini-embedding-001,gemini-embedding-2-preview')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const CHAT_MODEL = process.env.GEMINI_CHAT_MODEL ?? 'gemini-2.5-flash';

const STORY_PDF_PATH = path.resolve(__dirname, '..', 'assets', 'story.pdf');

type RagIndexStatus = 'ready' | 'building' | 'error' | 'missing';

type RagIndexDoc = {
  status?: RagIndexStatus;
  pdfSha256?: string;
  chunkCount?: number;
  error?: string | null;
  updatedAt?: any;
};

function requireGeminiKey() {
  if (!GEMINI_API_KEY || GEMINI_API_KEY === 'PASTE_YOUR_GEMINI_API_KEY_HERE') {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Missing GEMINI API key. Paste it into functions/src/index.ts (PASTE_YOUR_GEMINI_API_KEY_HERE) or set process.env.GEMINI_API_KEY.'
    );
  }
}

function sha256Hex(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function chunkText(text: string, chunkSize = 1200, overlap = 200): string[] {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];

  const chunks: string[] = [];
  let i = 0;
  while (i < cleaned.length) {
    const end = Math.min(i + chunkSize, cleaned.length);
    const chunk = cleaned.slice(i, end).trim();
    if (chunk) chunks.push(chunk);
    if (end === cleaned.length) break;
    i = Math.max(0, end - overlap);
  }
  return chunks;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    na += ai * ai;
    nb += bi * bi;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

function extractEmbeddingValues(embedResult: any): number[] {
  const values =
    embedResult?.embedding?.values ??
    embedResult?.embedding ??
    embedResult?.values ??
    embedResult?.data;

  if (!Array.isArray(values)) return [];
  return values.map((v) => (typeof v === 'number' ? v : Number(v))).filter((n) => Number.isFinite(n));
}

async function embedText(genAI: GoogleGenerativeAI, text: string): Promise<number[]> {
  let lastErr: any = null;
  const apiVersions = ['v1beta', 'v1'] as const;
  for (const modelName of EMBEDDING_MODELS) {
    for (const apiVersion of apiVersions) {
      try {
        const embeddingModel = genAI.getGenerativeModel({ model: modelName });
        const embedResult = await (embeddingModel as any).embedContent(text, { apiVersion });
        const embedding = extractEmbeddingValues(embedResult);
        if (embedding.length) return embedding;
      } catch (err: any) {
        lastErr = err;
      }
    }
  }
  throw lastErr ?? new Error('Failed to embed text with any configured model.');
}

async function ensureStoryPdfPresent(): Promise<{ pdfBuffer: Buffer; pdfSha256: string }> {
  let pdfBuffer: Buffer;
  try {
    const data = await fs.readFile(STORY_PDF_PATH);
    pdfBuffer = data as unknown as Buffer;
  } catch {
    throw new functions.https.HttpsError(
      'not-found',
      `Missing PDF at ${STORY_PDF_PATH}. Put your story file at functions/assets/story.pdf`
    );
  }

  return { pdfBuffer, pdfSha256: sha256Hex(pdfBuffer) };
}

async function buildRagIndex(pdfBuffer: Buffer, pdfSha256: string): Promise<number> {
  const ragChunks: string[] = [];
  const pdfParser = new PDFParse({ data: pdfBuffer });
  const textResult = await pdfParser.getText();
  const chunks = chunkText(textResult.text);
  ragChunks.push(...chunks);

  const maxChunks = Number(process.env.RAG_MAX_CHUNKS ?? '200');
  const chunksToEmbed = ragChunks.slice(0, maxChunks);
  if (chunksToEmbed.length === 0) return 0;

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY as string);

  const indexWritePromises: Promise<any>[] = [];
  for (let chunkIndex = 0; chunkIndex < chunksToEmbed.length; chunkIndex++) {
    const text = chunksToEmbed[chunkIndex];
    const embedding = await embedText(genAI, text);

    const docId = `${pdfSha256}_${chunkIndex}`;
    indexWritePromises.push(
      db.collection(RAG_CHUNKS_COLLECTION).doc(docId).set(
        {
          pdfSha256,
          chunkIndex,
          text,
          embedding,
          updatedAt: new Date(),
        },
        { merge: false }
      )
    );
  }

  await Promise.all(indexWritePromises);
  return chunksToEmbed.length;
}

export const ensureRagIndex = functions.https.onCall(async () => {
  requireGeminiKey();

  const indexRef = db.collection(RAG_INDEX_COLLECTION).doc(RAG_INDEX_DOC_ID);
  const current = await indexRef.get();
  const currentDoc: RagIndexDoc = current.exists ? (current.data() as RagIndexDoc) : {};

  const { pdfSha256 } = await ensureStoryPdfPresent();

  if (current.exists && currentDoc.status === 'ready' && currentDoc.pdfSha256 === pdfSha256) {
    return { status: 'ready' as RagIndexStatus, pdfSha256 };
  }

  if (current.exists && currentDoc.status === 'building') {
    return { status: 'building' as RagIndexStatus, message: 'Index is already being built.' };
  }

  await indexRef.set(
    {
      status: 'building' satisfies RagIndexStatus,
      pdfSha256,
      chunkCount: 0,
      updatedAt: new Date(),
      error: null,
    },
    { merge: true }
  );

  try {
    const chunkCount = await buildRagIndex((await fs.readFile(STORY_PDF_PATH)) as unknown as Buffer, pdfSha256);

    await indexRef.set(
      {
        status: 'ready' satisfies RagIndexStatus,
        chunkCount,
        updatedAt: new Date(),
        error: null,
      },
      { merge: true }
    );

    return { status: 'ready' as RagIndexStatus, pdfSha256, chunkCount };
  } catch (err: any) {
    const message = typeof err?.message === 'string' ? err.message : String(err);
    await indexRef.set(
      {
        status: 'error' satisfies RagIndexStatus,
        error: message,
        updatedAt: new Date(),
      },
      { merge: true }
    );
    throw new functions.https.HttpsError('internal', `Failed building RAG index: ${message}`);
  }
});

export const chatWithRag = functions.https.onCall(async (request) => {
  const data = (request as any)?.data ?? request;
  requireGeminiKey();

  const userMessageRaw = data?.message;
  const userMessage = typeof userMessageRaw === 'string' ? userMessageRaw.trim() : '';
  if (!userMessage) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing `message` string.');
  }

  const topK = Number(data?.topK ?? 6);
  const safeTopK = Number.isFinite(topK) ? Math.min(Math.max(topK, 1), 12) : 6;

  const indexRef = db.collection(RAG_INDEX_COLLECTION).doc(RAG_INDEX_DOC_ID);
  const indexSnap = await indexRef.get();
  if (!indexSnap.exists) {
    return { status: 'missing' as RagIndexStatus, message: 'Index not found. Call ensureRagIndex first.' };
  }

  const indexDoc = indexSnap.data() as RagIndexDoc;
  const status = indexDoc?.status ?? 'missing';
  if (status !== 'ready') {
    return {
      status: status as RagIndexStatus,
      message: `Index is not ready yet. Current status: ${status}`,
      pdfSha256: indexDoc?.pdfSha256 ?? null,
      chunkCount: indexDoc?.chunkCount ?? 0,
      error: indexDoc?.error ?? null,
    };
  }

  const pdfSha256 = indexDoc.pdfSha256;
  if (!pdfSha256) {
    return { status: 'error' as RagIndexStatus, message: 'Index is ready but missing pdfSha256.' };
  }

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY as string);
  const chatModel = genAI.getGenerativeModel({ model: CHAT_MODEL });

  let queryEmbedding: number[] = [];
  try {
    queryEmbedding = await embedText(genAI, userMessage);
  } catch {
    throw new functions.https.HttpsError('internal', 'Failed to embed the user query.');
  }

  const chunksSnap = await db
    .collection(RAG_CHUNKS_COLLECTION)
    .where('pdfSha256', '==', pdfSha256)
    .get();

  const chunkDocs = chunksSnap.docs.map((d) => d.data());

  const scored = chunkDocs
    .map((c: any) => {
      const embedding = Array.isArray(c.embedding) ? c.embedding : [];
      const chunkEmbedding = embedding.map((v: any) => (typeof v === 'number' ? v : Number(v))).filter((n: any) => Number.isFinite(n));
      const score = cosineSimilarity(queryEmbedding, chunkEmbedding);
      return {
        chunkIndex: Number(c.chunkIndex ?? 0),
        text: typeof c.text === 'string' ? c.text : '',
        score,
      };
    })
    .filter((c: any) => c.text && c.score > -1)
    .sort((a: any, b: any) => b.score - a.score);

  const topChunks = scored.slice(0, safeTopK);
  const totalContextLimitChars = 12000;
  let usedChars = 0;
  const contextParts: string[] = [];
  for (const [i, c] of topChunks.entries()) {
    const label = `Excerpt ${i + 1}`;
    const part = `${label}:\n${c.text}\n`;
    if (usedChars + part.length > totalContextLimitChars) break;
    usedChars += part.length;
    contextParts.push(part);
  }

  const prompt = `You are a helpful assistant that answers questions using ONLY the provided story excerpts.
If the answer cannot be found in the excerpts, say: "I don't know based on the provided story."

Question:
${userMessage}

Story excerpts:
${contextParts.join('\n')}`;

  const result = await chatModel.generateContent(prompt);
  const answer = result?.response?.text?.() ?? '';

  return {
    status: 'ok',
    answer,
    sources: topChunks.map((c) => ({ chunkIndex: c.chunkIndex })),
  };
});

