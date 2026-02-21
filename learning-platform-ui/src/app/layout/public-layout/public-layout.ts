import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { filter, startWith, Subscription } from 'rxjs';

import { Auth } from '../../core/services/auth';

@Component({
  selector: 'app-public-layout',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './public-layout.html',
  styleUrl: './public-layout.scss',
})
export class PublicLayoutComponent implements OnDestroy {
  hideTopbar = false;

  private sub?: Subscription;

  constructor(public auth: Auth, private router: Router) {
    // Hide public topbar on /home (including hash routing cases)
    const compute = (url: string) => {
      // supports: /home, /#/home, /#/home?x=...
      this.hideTopbar = /(^|\/)#?\/?home(\?|$)/.test(url) || url === '/home' || url.startsWith('/home?');
    };

    // initial
    compute(this.router.url);

    // update on navigation
    this.sub = this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        startWith(null)
      )
      .subscribe(() => compute(this.router.url));
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

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
