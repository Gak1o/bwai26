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
        <div>
          <h2 class="title">Chat with your document</h2>
          <div class="status">
            <ng-container *ngIf="indexStatus === 'ready'">
              Index ready. You can ask anything.
            </ng-container>
            <ng-container *ngIf="indexStatus === 'building'">
              Building knowledge base from PDF... (this can take a minute)
            </ng-container>
            <ng-container *ngIf="indexStatus === 'error'">
              Backend error: {{ indexError || 'Unknown error' }}
            </ng-container>
            <ng-container *ngIf="indexStatus === 'missing'">
              Index missing. Click "Retry".
            </ng-container>
          </div>
        </div>
        <button class="secondary" (click)="retryIndex()" [disabled]="indexStatus === 'building' || indexStatus === 'ready'">
          Retry
        </button>
      </div>

      <div class="chat">
        <div class="messages">
          <div *ngFor="let m of messages" class="msg" [class.user]="m.role === 'user'" [class.assistant]="m.role === 'assistant'">
            <div class="role">{{ m.role === 'user' ? 'You' : 'Assistant' }}</div>
            <div class="content">{{ m.content }}</div>
          </div>

          <div *ngIf="isSending" class="msg assistant">
            <div class="role">Assistant</div>
            <div class="content">Thinking...</div>
          </div>
        </div>
      </div>

      <div class="composer">
        <textarea class="input" rows="2" placeholder="Type your question..." [(ngModel)]="draft"></textarea>
        <button class="cta" (click)="send()" [disabled]="!draft.trim() || isSending || indexStatus !== 'ready'">
          Send
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      .wrap {
        min-height: 100vh;
        background: #0b1020;
        color: #eaf0ff;
        display: flex;
        flex-direction: column;
      }
      .topbar {
        padding: 18px 18px 10px 18px;
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
      }
      .title {
        margin: 0;
        font-size: 22px;
        letter-spacing: -0.01em;
      }
      .status {
        margin-top: 6px;
        opacity: 0.8;
        font-size: 13px;
        max-width: 720px;
      }
      .secondary {
        appearance: none;
        border: 1px solid rgba(255, 255, 255, 0.18);
        background: transparent;
        color: #eaf0ff;
        border-radius: 10px;
        padding: 10px 12px;
        cursor: pointer;
        font-weight: 600;
      }
      .secondary:disabled {
        opacity: 0.5;
        cursor: default;
      }

      .chat {
        flex: 1;
        padding: 0 18px 18px 18px;
      }
      .messages {
        max-width: 900px;
        margin: 0 auto;
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding-top: 10px;
      }

      .msg {
        border-radius: 14px;
        padding: 12px 14px;
        border: 1px solid rgba(255, 255, 255, 0.12);
      }
      .msg.user {
        background: rgba(109, 94, 252, 0.14);
        border-color: rgba(109, 94, 252, 0.35);
      }
      .msg.assistant {
        background: rgba(255, 255, 255, 0.06);
      }
      .role {
        font-weight: 700;
        font-size: 12px;
        opacity: 0.85;
        margin-bottom: 6px;
      }
      .content {
        white-space: pre-wrap;
        line-height: 1.45;
        font-size: 14px;
      }

      .composer {
        padding: 12px 18px 18px 18px;
        display: flex;
        gap: 12px;
        max-width: 900px;
        width: 100%;
        margin: 0 auto;
      }
      .input {
        flex: 1;
        border-radius: 12px;
        border: 1px solid rgba(255, 255, 255, 0.18);
        background: rgba(255, 255, 255, 0.04);
        color: #eaf0ff;
        padding: 10px 12px;
        resize: none;
      }
      .cta {
        appearance: none;
        border: 0;
        border-radius: 12px;
        padding: 10px 16px;
        background: #6d5efc;
        color: white;
        font-weight: 700;
        cursor: pointer;
      }
      .cta:disabled {
        opacity: 0.6;
        cursor: default;
      }
    `,
  ],
})
export class ChatComponent implements OnInit {
  messages: ChatMessage[] = [];
  draft = '';

  indexStatus: 'ready' | 'building' | 'error' | 'missing' = 'building';
  indexError: string | null = null;

  isSending = false;

  constructor(private rag: RagService) {}

  ngOnInit() {
    this.bootstrapIndex();
  }

  private async sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  private async bootstrapIndex() {
    this.indexError = null;
    this.indexStatus = 'building';

    for (let attempt = 0; attempt < 45; attempt++) {
      try {
        const res = await this.rag.ensureIndex();
        if (res.status === 'ready') {
          this.indexStatus = 'ready';
          return;
        }
        if (res.status === 'building') {
          this.indexStatus = 'building';
          await this.sleep(2000);
          continue;
        }
        if (res.status === 'error') {
          this.indexStatus = 'error';
          this.indexError = res.message ?? 'Failed building index';
          return;
        }
      } catch (e: any) {
        this.indexStatus = 'error';
        this.indexError = e?.message ?? String(e);
        return;
      }
    }

    this.indexStatus = 'missing';
  }

  async retryIndex() {
    if (this.indexStatus === 'building') return;
    await this.bootstrapIndex();
  }

  async send() {
    if (!this.draft.trim() || this.isSending) return;
    if (this.indexStatus !== 'ready') return;

    const message = this.draft.trim();
    this.draft = '';

    this.messages.push({ role: 'user', content: message });
    this.isSending = true;

    try {
      const res = await this.rag.chat(message, 6);
      if (res.status === 'ok') {
        this.messages.push({ role: 'assistant', content: res.answer });
      } else if (res.status === 'building') {
        this.messages.push({
          role: 'assistant',
          content: 'The index is still building. Please try again in a moment.',
        });
        this.indexStatus = 'building';
        await this.bootstrapIndex();
      } else {
        this.messages.push({
          role: 'assistant',
          content: res.message ?? `Request failed (status: ${res.status}).`,
        });
      }
    } catch (e: any) {
      this.messages.push({
        role: 'assistant',
        content: `Error: ${e?.message ?? String(e)}`,
      });
    } finally {
      this.isSending = false;
    }
  }
}

