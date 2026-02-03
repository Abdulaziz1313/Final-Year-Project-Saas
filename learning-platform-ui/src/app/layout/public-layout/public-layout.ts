import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { Auth } from '../../core/services/auth';

@Component({
  selector: 'app-public-layout',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './public-layout.html',
  styleUrl: './public-layout.scss',
})
export class PublicLayoutComponent {
  constructor(public auth: Auth, private router: Router) {}

  get loggedIn() {
    return this.auth.isLoggedIn();
  }

  get isStudent() {
    return this.auth.hasRole('Student');
  }

  get isInstructor() {
    return this.auth.hasRole('Instructor');
  }

  get isAdmin() {
    return this.auth.hasRole('Admin');
  }

  logout() {
    sessionStorage.removeItem('login_notice');
    this.auth.logout();
    this.router.navigateByUrl('/home');
  }
}
