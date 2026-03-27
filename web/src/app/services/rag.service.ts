import { Injectable } from '@angular/core';
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getFunctions, httpsCallable, connectFunctionsEmulator } from 'firebase/functions';
import { firebaseConfig } from '../firebaseConfig';

type EnsureRagIndexResponse =
  | { status: 'ready'; pdfSha256: string; chunkCount?: number }
  | { status: 'building'; message?: string }
  | { status: 'error'; message?: string };

type ChatWithRagResponse =
  | { status: 'ok'; answer: string; sources?: Array<{ chunkIndex: number }> }
  | {
      status: 'ready' | 'building' | 'error' | 'missing';
      message?: string;
      pdfSha256?: string | null;
      chunkCount?: number;
      error?: string | null;
    };

@Injectable({ providedIn: 'root' })
export class RagService {
  private app: FirebaseApp;
  private ensureRagIndexFn: ReturnType<typeof httpsCallable>;
  private chatWithRagFn: ReturnType<typeof httpsCallable>;

  constructor() {
    this.app = (getApps().length ? getApps()[0] : initializeApp(firebaseConfig)) as FirebaseApp;
    const functions = getFunctions(this.app);

    const host =
      typeof window !== 'undefined' && window.location ? window.location.hostname : '';
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
      connectFunctionsEmulator(functions, 'localhost', 5001);
    }

    this.ensureRagIndexFn = httpsCallable(functions, 'ensureRagIndex');
    this.chatWithRagFn = httpsCallable(functions, 'chatWithRag');
  }

  async ensureIndex(): Promise<EnsureRagIndexResponse> {
    const res = await this.ensureRagIndexFn({});
    return res.data as EnsureRagIndexResponse;
  }

  async chat(message: string, topK = 6): Promise<ChatWithRagResponse> {
    const res = await this.chatWithRagFn({ message, topK });
    return res.data as ChatWithRagResponse;
  }
}

