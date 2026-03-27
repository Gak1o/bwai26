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
  styles: [
    `
      .page {
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 24px;
        gap: 12px;
        text-align: center;
        background: #0b1020;
        color: #eaf0ff;
      }
      .title {
        font-size: 40px;
        margin: 0;
        letter-spacing: -0.02em;
      }
      .subtitle {
        margin: 0;
        opacity: 0.85;
        max-width: 720px;
      }
      .cta {
        margin-top: 10px;
        appearance: none;
        border: 0;
        padding: 12px 18px;
        border-radius: 10px;
        background: #6d5efc;
        color: white;
        font-weight: 600;
        cursor: pointer;
        font-size: 16px;
      }
      .cta:active {
        transform: translateY(1px);
      }
      .hint {
        margin: 0;
        opacity: 0.7;
        max-width: 720px;
        font-size: 13px;
      }
    `,
  ],
})
export class LandingComponent {
  constructor(private router: Router) {}

  proceedToChat() {
    this.router.navigate(['/chat']);
  }
}

