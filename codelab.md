# Story Angular RAG Chat on Firebase
summary: Deploy a simple Angular + Firebase + Gemini RAG app that answers questions from a story PDF.
id: story-rag-chat-firebase
categories: firebase,angular,ai,web
tags: beginner,deploy-first,code-along
status: Published
authors: ANTO
feedback link: https://github.com/gak1o/bwai26/issues

## Introduction
Duration: 1

Welcome! By the end of this lab, you will have a deployed **Angular RAG Chatbot** that acts as an expert on your provided PDF document.

### What you will learn:
- Cloning a repository in Cloud Shell.
- Configuring a Firebase project for Web and Functions.
- Securely storing a Gemini API key using Google Cloud Secret Manager.
- Deploying a full-stack AI app.

### Prerequisites:
- A Google Cloud Planning project with **Billing** and **Firebase** enabled.
- A **Gemini API Key** from [Google AI Studio](https://aistudio.google.com/app/apikey).

---

## Step 1: Open Cloud Shell & Clone
Duration: 3

1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Click the **Activate Cloud Shell** button (top right).
3. Clone the repo and enter the project folder:

```bash
git clone https://github.com/gak1o/bwai26.git
cd bwai26
```

---

## Step 2: Login & Select Project
Duration: 3

1. Authenticate with Firebase:
```bash
firebase login --no-localhost
```

2. Link your Firebase project:
```bash
firebase use --add
```
Select the project you created for this codelab.

---

## Step 3: Add Your PDF
Duration: 2

The AI needs a source. Rename your choice of story PDF to **`story.pdf`** and place it here:

`functions/assets/story.pdf`

---

## Step 4: Configure Frontend
Duration: 5

Open `web/src/app/firebaseConfig.ts` and paste your project config:

```typescript
export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  appId: "YOUR_APP_ID"
};
```

---

## Step 4.5: Implement the Landing Page
Duration: 5

Open `web/src/app/landing/landing.component.ts`. Replace its contents with this UI code:

```typescript
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page">
      <h1 class="title">A very important app.</h1>
      <button class="cta" (click)="proceedToChat()">Proceed to chat</button>
    </div>
  `,
  styles: [`
    .page { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #0b1020; color: #eaf0ff; }
    .title { font-size: 40px; margin: 0; }
    .cta { margin-top: 10px; border: 0; padding: 12px 18px; border-radius: 10px; background: #6d5efc; color: white; cursor: pointer; }
  `],
})
export class LandingComponent {
  constructor(private router: Router) {}
  proceedToChat() { this.router.navigate(['/chat']); }
}
```

---

## Step 4.6: Implement the Chat Interface
Duration: 10

Open `web/src/app/chat/chat.component.ts`. Paste the core chat logic:

```typescript
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RagService } from '../services/rag.service';

type ChatMessage = { role: 'user' | 'assistant'; content: string };

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="wrap">
      <div class="topbar">
        <h2 class="title">Chat with your document</h2>
        <div class="status">{{ indexStatus === 'ready' ? 'Ready' : 'Building...' }}</div>
      </div>
      <div class="chat">
        <div *ngFor="let m of messages" class="msg" [class.user]="m.role === 'user'">
          <b>{{ m.role === 'user' ? 'You' : 'Assistant' }}</b>: {{ m.content }}
        </div>
      </div>
      <div class="composer">
        <input [(ngModel)]="draft" (keyup.enter)="send()" placeholder="Ask something...">
        <button (click)="send()" [disabled]="isSending">Send</button>
      </div>
    </div>
  `,
  styles: [`
    .wrap { min-height: 100vh; background: #0b1020; color: #eaf0ff; display: flex; flex-direction: column; }
    .topbar { padding: 18px; border-bottom: 1px solid rgba(255,255,255,0.1); }
    .chat { flex: 1; padding: 18px; overflow-y: auto; }
    .msg { margin-bottom: 12px; }
    .composer { padding: 18px; display: flex; gap: 8px; }
    input { flex: 1; border-radius: 8px; padding: 8px; }
  `]
})
export class ChatComponent implements OnInit {
  messages: ChatMessage[] = [];
  draft = '';
  indexStatus = 'building';
  isSending = false;

  constructor(private rag: RagService) {}

  ngOnInit() { this.pollIndex(); }

  async pollIndex() {
    for(let i=0; i<30; i++) {
      const res = await this.rag.ensureIndex();
      if(res.status === 'ready') { this.indexStatus = 'ready'; return; }
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  async send() {
    if(!this.draft.trim()) return;
    const m = this.draft; this.draft = '';
    this.messages.push({ role: 'user', content: m });
    this.isSending = true;
    const res = await this.rag.chat(m, 6);
    this.messages.push({ role: 'assistant', content: res.answer });
    this.isSending = false;
  }
}
```

---

## Step 5: Secure Your Gemini Key
Duration: 3

Set your API key securely:

```bash
firebase functions:secrets:set GEMINI_API_KEY
```

---

## Step 5.5: Implement the RAG Logic
Duration: 15

Open `functions/src/index.ts`. Replace everything with the full RAG pipeline:

```typescript
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PDFParse } from 'pdf-parse';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

admin.initializeApp();
const db = admin.firestore();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const EMBEDDING_MODELS = ['gemini-embedding-001'];
const CHAT_MODEL = 'gemini-1.5-flash';
const STORY_PDF_PATH = path.resolve(__dirname, '..', 'assets', 'story.pdf');

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
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export const ensureRagIndex = functions.https.onCall(async (req) => {
  const { pdfSha256 } = await ensureStoryPdfPresent();
  const indexRef = db.collection('rag_index').doc('default');
  await indexRef.set({ status: 'building', pdfSha256, updatedAt: new Date() });
  try {
    const data = await fs.readFile(STORY_PDF_PATH);
    const pdfParser = new PDFParse(data);
    const textResult = await pdfParser.getText();
    const chunks = chunkText(textResult.text);
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY || '');
    const model = genAI.getGenerativeModel({ model: EMBEDDING_MODELS[0] });

    for (let i = 0; i < chunks.length; i++) {
      const res = await model.embedContent(chunks[i]);
      await db.collection('rag_chunks').add({
        pdfSha256, text: chunks[i], embedding: res.embedding.values, updatedAt: new Date()
      });
    }
    await indexRef.update({ status: 'ready' });
    return { status: 'ready' };
  } catch (err: any) {
    await indexRef.update({ status: 'error', error: err.message });
    throw err;
  }
});

export const chatWithRag = functions.https.onCall(async (req) => {
  const userMessage = req.data.message;
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY || '');
  const chatModel = genAI.getGenerativeModel({ model: CHAT_MODEL });
  const embedModel = genAI.getGenerativeModel({ model: EMBEDDING_MODELS[0] });

  const queryRes = await embedModel.embedContent(userMessage);
  const queryEmbed = queryRes.embedding.values;

  const chunksSnap = await db.collection('rag_chunks').get();
  const scored = chunksSnap.docs.map(d => ({
    text: d.data().text,
    score: cosineSimilarity(queryEmbed, d.data().embedding)
  })).sort((a,b) => b.score - a.score).slice(0, 5);

  const context = scored.map(s => s.text).join('\n---\n');
  const prompt = `Answer based on this story excerpt: ${context}\n\nQuestion: ${userMessage}`;
  const result = await chatModel.generateContent(prompt);
  return { answer: result.response.text() };
});

async function ensureStoryPdfPresent() {
  const data = await fs.readFile(STORY_PDF_PATH);
  return { pdfSha256: sha256Hex(data as unknown as Buffer) };
}
```

---

## Step 6: Build and Deploy
Duration: 5

Run:
```bash
firebase deploy
```

---

## Step 7: Access & Test
Duration: 3

1. Open the **Hosting URL**.
2. Start chatting with your AI!
