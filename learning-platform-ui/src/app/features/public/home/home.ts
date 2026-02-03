import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Auth } from '../../../core/services/auth';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class HomeComponent {
  year = new Date().getFullYear();

  constructor(public auth: Auth) {}

  get isLoggedIn(): boolean {
    return !!this.auth.isLoggedIn?.();
  }

  get isInstructor(): boolean {
    try { return this.auth.hasRole?.('Instructor'); } catch { return false; }
  }

  get isStudent(): boolean {
    try { return this.auth.hasRole?.('Student'); } catch { return false; }
  }
}
