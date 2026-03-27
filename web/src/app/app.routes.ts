import { Routes } from '@angular/router';
import { LandingComponent } from './landing/landing.component';
import { ChatComponent } from './chat/chat.component';

export const routes: Routes = [
  { path: '', component: LandingComponent },
  { path: 'chat', component: ChatComponent },
  { path: '**', redirectTo: '' },
];
