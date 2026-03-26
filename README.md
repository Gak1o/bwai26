# Story RAG Chat (Angular + Firebase + Gemini)

Minimal webapp:
- Landing page: title + **Proceed to chat**
- Chat page: RAG over a story PDF using **Gemini embeddings**

## 1) Add your PDF (content source)
1. Copy your story PDF into:
   - `functions/assets/story.pdf`
2. (Optional) Update nothing else; the backend ingests the PDF automatically the first time you open `/chat`.

## 2) Set your Gemini API key (backend)
The backend uses `process.env.GEMINI_API_KEY`.

If you want a quick copy/paste workflow, edit:
- `functions/src/index.ts`
  - replace `PASTE_YOUR_GEMINI_API_KEY_HERE` with your real Gemini API key.

For local testing, set it in your environment before running the functions emulator.

For deployed Firebase Functions, set a secret/environment variable so the function can read `GEMINI_API_KEY`.

## 3) Set Firebase client config (frontend)
Open:
- `web/src/app/firebaseConfig.ts`

Replace the placeholders with your Firebase web app config (from your Firebase project settings).

## 4) Build & deploy (high level)
1. Build the Angular app: `npm run build` (from `web/`)
2. Deploy:
   - Firebase Hosting for the web
   - Firebase Functions for the RAG endpoints

## Endpoints
The Angular app calls 2 callable functions:
- `ensureRagIndex` (ingests `functions/assets/story.pdf` into Firestore embeddings)
- `chatWithRag` (retrieves relevant excerpts + asks Gemini to answer)

