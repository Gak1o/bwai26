"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.chatWithRag = exports.ensureRagIndex = void 0;
const admin = __importStar(require("firebase-admin"));
const functions = __importStar(require("firebase-functions"));
const generative_ai_1 = require("@google/generative-ai");
const pdf_parse_1 = require("pdf-parse");
const dotenv_1 = __importDefault(require("dotenv"));
const crypto_1 = __importDefault(require("crypto"));
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config();
admin.initializeApp();
const db = admin.firestore();
const RAG_INDEX_DOC_ID = 'default';
const RAG_INDEX_COLLECTION = 'rag_index';
const RAG_CHUNKS_COLLECTION = 'rag_chunks';
// Gemini API key.
// Recommended: set via Firebase Functions env/Secrets.
// For quick testing you can paste the key here.
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? 'AIzaSyBy231dOVd88_Nz1tX3pvPkoRN4ixKfa9k';
// Embedding model candidates; override with `GEMINI_EMBED_MODEL` (comma-separated).
// We also try Gemini API `v1` for embeddings because some models don't support `v1beta`.
const EMBEDDING_MODELS = (process.env.GEMINI_EMBED_MODEL ?? 'gemini-embedding-001,gemini-embedding-2-preview')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
const CHAT_MODEL = process.env.GEMINI_CHAT_MODEL ?? 'gemini-2.5-flash';
// Compiled code lives in `lib/`, so `..` points back to `functions/`.
const STORY_PDF_PATH = path_1.default.resolve(__dirname, '..', 'assets', 'story.pdf');
function requireGeminiKey() {
    if (!GEMINI_API_KEY || GEMINI_API_KEY === 'PASTE_YOUR_GEMINI_API_KEY_HERE') {
        throw new functions.https.HttpsError('failed-precondition', 'Missing GEMINI API key. Paste it into functions/src/index.ts (PASTE_YOUR_GEMINI_API_KEY_HERE) or set process.env.GEMINI_API_KEY.');
    }
}
function sha256Hex(buffer) {
    return crypto_1.default.createHash('sha256').update(buffer).digest('hex');
}
function chunkText(text, chunkSize = 1200, overlap = 200) {
    const cleaned = text.replace(/\s+/g, ' ').trim();
    if (!cleaned)
        return [];
    const chunks = [];
    let i = 0;
    while (i < cleaned.length) {
        const end = Math.min(i + chunkSize, cleaned.length);
        const chunk = cleaned.slice(i, end).trim();
        if (chunk)
            chunks.push(chunk);
        if (end === cleaned.length)
            break;
        i = Math.max(0, end - overlap);
    }
    return chunks;
}
function cosineSimilarity(a, b) {
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
function extractEmbeddingValues(embedResult) {
    const values = embedResult?.embedding?.values ??
        embedResult?.embedding ??
        embedResult?.values ??
        embedResult?.data;
    if (!Array.isArray(values))
        return [];
    return values.map((v) => (typeof v === 'number' ? v : Number(v))).filter((n) => Number.isFinite(n));
}
async function embedText(genAI, text) {
    let lastErr = null;
    const apiVersions = ['v1beta', 'v1'];
    for (const modelName of EMBEDDING_MODELS) {
        for (const apiVersion of apiVersions) {
            try {
                const embeddingModel = genAI.getGenerativeModel({ model: modelName });
                // `apiVersion` affects which embedding models/methods are available.
                const embedResult = await embeddingModel.embedContent(text, { apiVersion });
                const embedding = extractEmbeddingValues(embedResult);
                if (embedding.length)
                    return embedding;
            }
            catch (err) {
                lastErr = err;
            }
        }
    }
    throw lastErr ?? new Error('Failed to embed text with any configured model.');
}
async function ensureStoryPdfPresent() {
    let pdfBuffer;
    try {
        const data = await promises_1.default.readFile(STORY_PDF_PATH);
        pdfBuffer = data;
    }
    catch {
        throw new functions.https.HttpsError('not-found', `Missing PDF at ${STORY_PDF_PATH}. Put your story file at functions/assets/story.pdf`);
    }
    return { pdfBuffer, pdfSha256: sha256Hex(pdfBuffer) };
}
async function buildRagIndex(pdfBuffer, pdfSha256) {
    const ragChunks = [];
    const pdfParser = new pdf_parse_1.PDFParse({ data: pdfBuffer });
    const textResult = await pdfParser.getText();
    const chunks = chunkText(textResult.text);
    ragChunks.push(...chunks);
    const maxChunks = Number(process.env.RAG_MAX_CHUNKS ?? '200');
    const chunksToEmbed = ragChunks.slice(0, maxChunks);
    if (chunksToEmbed.length === 0)
        return 0;
    const genAI = new generative_ai_1.GoogleGenerativeAI(GEMINI_API_KEY);
    const indexWritePromises = [];
    for (let chunkIndex = 0; chunkIndex < chunksToEmbed.length; chunkIndex++) {
        const text = chunksToEmbed[chunkIndex];
        const embedding = await embedText(genAI, text);
        const docId = `${pdfSha256}_${chunkIndex}`;
        indexWritePromises.push(db.collection(RAG_CHUNKS_COLLECTION).doc(docId).set({
            pdfSha256,
            chunkIndex,
            text,
            embedding,
            // `FieldValue.serverTimestamp()` isn't available in some emulator/Admin SDK combinations.
            // Using a concrete timestamp keeps ingestion working everywhere.
            updatedAt: new Date(),
        }, { merge: false }));
    }
    // Firestore writes can be heavy; we still cap concurrency per run by awaiting at the end.
    await Promise.all(indexWritePromises);
    return chunksToEmbed.length;
}
exports.ensureRagIndex = functions.https.onCall(async () => {
    requireGeminiKey();
    const indexRef = db.collection(RAG_INDEX_COLLECTION).doc(RAG_INDEX_DOC_ID);
    const current = await indexRef.get();
    const currentDoc = current.exists ? current.data() : {};
    const { pdfSha256 } = await ensureStoryPdfPresent();
    if (current.exists && currentDoc.status === 'ready' && currentDoc.pdfSha256 === pdfSha256) {
        return { status: 'ready', pdfSha256 };
    }
    if (current.exists && currentDoc.status === 'building') {
        return { status: 'building', message: 'Index is already being built.' };
    }
    await indexRef.set({
        status: 'building',
        pdfSha256,
        chunkCount: 0,
        updatedAt: new Date(),
        error: null,
    }, { merge: true });
    try {
        const chunkCount = await buildRagIndex(
        // Re-read to keep the ingestion simple and avoid persisting large buffers in memory longer than needed.
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        (await promises_1.default.readFile(STORY_PDF_PATH)), pdfSha256);
        await indexRef.set({
            status: 'ready',
            chunkCount,
            updatedAt: new Date(),
            error: null,
        }, { merge: true });
        return { status: 'ready', pdfSha256, chunkCount };
    }
    catch (err) {
        const message = typeof err?.message === 'string' ? err.message : String(err);
        await indexRef.set({
            status: 'error',
            error: message,
            updatedAt: new Date(),
        }, { merge: true });
        throw new functions.https.HttpsError('internal', `Failed building RAG index: ${message}`);
    }
});
exports.chatWithRag = functions.https.onCall(async (request) => {
    const data = request?.data ?? request;
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
        return { status: 'missing', message: 'Index not found. Call ensureRagIndex first.' };
    }
    const indexDoc = indexSnap.data();
    const status = indexDoc?.status ?? 'missing';
    if (status !== 'ready') {
        return {
            status: status,
            message: `Index is not ready yet. Current status: ${status}`,
            pdfSha256: indexDoc?.pdfSha256 ?? null,
            chunkCount: indexDoc?.chunkCount ?? 0,
            error: indexDoc?.error ?? null,
        };
    }
    const pdfSha256 = indexDoc.pdfSha256;
    if (!pdfSha256) {
        return { status: 'error', message: 'Index is ready but missing pdfSha256.' };
    }
    const genAI = new generative_ai_1.GoogleGenerativeAI(GEMINI_API_KEY);
    const chatModel = genAI.getGenerativeModel({ model: CHAT_MODEL });
    let queryEmbedding = [];
    try {
        queryEmbedding = await embedText(genAI, userMessage);
    }
    catch {
        throw new functions.https.HttpsError('internal', 'Failed to embed the user query.');
    }
    const chunksSnap = await db
        .collection(RAG_CHUNKS_COLLECTION)
        .where('pdfSha256', '==', pdfSha256)
        .get();
    const chunkDocs = chunksSnap.docs.map((d) => d.data());
    const scored = chunkDocs
        .map((c) => {
        const embedding = Array.isArray(c.embedding) ? c.embedding : [];
        const chunkEmbedding = embedding.map((v) => (typeof v === 'number' ? v : Number(v))).filter((n) => Number.isFinite(n));
        const score = cosineSimilarity(queryEmbedding, chunkEmbedding);
        return {
            chunkIndex: Number(c.chunkIndex ?? 0),
            text: typeof c.text === 'string' ? c.text : '',
            score,
        };
    })
        .filter((c) => c.text && c.score > -1)
        .sort((a, b) => b.score - a.score);
    const topChunks = scored.slice(0, safeTopK);
    const totalContextLimitChars = 12000;
    let usedChars = 0;
    const contextParts = [];
    for (const [i, c] of topChunks.entries()) {
        const label = `Excerpt ${i + 1}`;
        const part = `${label}:\n${c.text}\n`;
        if (usedChars + part.length > totalContextLimitChars)
            break;
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
