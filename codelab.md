# Story RAG Chat (Angular + Firebase + Gemini) - Deploy-first Codelab

## Overview
Build a very small web app that:
1. Shows an intro page with a **Proceed to chat** button
2. Uses a PDF (`story.pdf`) as the knowledge source
3. Uses **Gemini embeddings** to index the PDF (RAG)
4. Answers user questions by retrieving the most relevant PDF excerpts

This repository contains:
- `web/` (Angular UI)
- `functions/` (Firebase Functions backend with RAG logic)

## Time
~25-45 minutes

## What you will learn
- How to wire an Angular frontend to Firebase callable Functions
- How to ingest a PDF into Firestore embeddings
- How to do retrieval (cosine similarity) and prompt Gemini for an answer

## Prerequisites
- Node.js installed (Node 18+; this project works with Node 22+)
- Firebase CLI installed: `npm i -g firebase-tools`
- Logged in to Firebase: `firebase login`
- A Gemini API key (from Google AI Studio / Gemini API)

## Lesson 1: Create / configure Firebase project (deploy target)
1. Open the Firebase Console and create a project (or select an existing one).
2. Enable **Firestore**:
   - Firebase Console -> Firestore Database -> **Create database**
3. Add a **Web App** (to get the client config):
   - Project Settings -> General -> Your apps -> **Add app** -> Web app
   - Copy the Firebase config object.

## Lesson 2: Link this folder to your Firebase project
From the repo root:
```sh
firebase login
firebase use --add
```
Pick your Firebase project and set it as the default.

This creates/updates `.firebaserc` and ensures `firebase deploy` targets the right project.

## Lesson 3: Put the PDF into the backend
Your content source is bundled by filename.

1. Copy/rename your story PDF to:
   - `functions/assets/story.pdf`

On first chat, the backend reads that PDF and builds embeddings automatically.

## Lesson 4: Configure Gemini API key for the backend (deploy-safe)
The backend needs `GEMINI_API_KEY` at runtime to call Gemini for:
- embeddings (`embedContent`)
- chat (`generateContent`)

Recommended: set it as a **Firebase Functions secret** (do not commit keys).

Using Firebase CLI (recommended):
```sh
firebase functions:secrets:set GEMINI_API_KEY
```
Paste your key when prompted.

Then update your deployed function(s) to access the secret (if prompted by Firebase tooling during deploy).

Quick dev-only alternative (NOT recommended for public repos):
- Open `functions/src/index.ts`
- Replace `PASTE_YOUR_GEMINI_API_KEY_HERE`

Then build:
```sh
npm run build
```
(run from the `functions/` folder)

## Lesson 5: Configure the Angular Firebase client
1. Open:
   - `web/src/app/firebaseConfig.ts`
2. Replace the placeholder values with the Firebase config values from Lesson 1.

Then build:
```sh
npm run build
```
(run from the `web/` folder)

## Lesson 6: Deploy
From repo root:
```sh
firebase deploy
```

After deploy finishes:
- Hosting prints a URL (your live web app)
- Functions deploy the callable endpoints:
  - `ensureRagIndex`
  - `chatWithRag`

## Lesson 7: Verify the deployed app
1. Open the Hosting URL.
2. Click **Proceed to chat**.
3. The first load may take time while `ensureRagIndex` ingests `story.pdf`.
4. Ask a question about the story and confirm you get a grounded answer.

## Under the hood (brief)
### 1) PDF -> chunks
- The backend parses `functions/assets/story.pdf` with `pdf-parse`
- It converts the extracted text into overlapping chunks

### 2) Chunks -> embeddings
- For each chunk, it calls Gemini embedding model(s):
  - `gemini-embedding-001`
  - `gemini-embedding-2-preview`
- Embeddings are stored in Firestore:
  - `rag_chunks` collection
  - `rag_index/default` holds status and metadata

### 3) Retrieval -> relevant excerpts
- When you ask a question:
  - it embeds the question
  - loads candidate chunks for the same `pdfSha256`
  - computes cosine similarity
  - picks top `topK` excerpts

### 4) Gemini -> final answer
- It sends a prompt to Gemini chat model (defaults to `gemini-2.5-flash`)
- Prompt instructs the model to answer using ONLY the excerpts

## Troubleshooting
### “Backend error INTERNAL” in the deployed UI
Common causes:
- Missing/incorrect `GEMINI_API_KEY` in deployed Functions
- Firestore not enabled in the Firebase project
- The PDF is missing at `functions/assets/story.pdf` in the deployed build

### Embedding model 404 (embedContent not supported)
If embeddings fail with `... embedding model ... not found ...`, your Gemini API key may not support the default model.
To fix:
- Set `GEMINI_EMBED_MODEL` in the Functions environment or update the model list in `functions/src/index.ts`.

## Appendix A: Run locally with emulators (optional)
If you want a local test loop:
```sh
firebase emulators:start
```
Then open:
- `http://127.0.0.1:5000`

Optional smoke test:
```sh
node web/scripts/smoke-rag.js
```

## Where to look in the code
- Backend (RAG + Gemini):
  - `functions/src/index.ts`
- Frontend (UI + calling Functions):
  - `web/src/app/landing/landing.component.ts`
  - `web/src/app/chat/chat.component.ts`
  - `web/src/app/services/rag.service.ts`
- PDF content source:
  - `functions/assets/story.pdf`

## End
You should now have:
- A working intro + chat UI
- A working RAG backend that turns your PDF into embeddings
- Gemini answering grounded in your PDF excerpts

