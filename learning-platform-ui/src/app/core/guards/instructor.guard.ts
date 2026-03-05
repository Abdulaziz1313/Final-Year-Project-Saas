import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { Auth } from '../services/auth';

export const instructorGuard: CanActivateFn = (route, state) => {
  const auth = inject(Auth);
  const router = inject(Router);

  if (!auth.isLoggedIn()) {
    sessionStorage.setItem('return_url', state.url);
    sessionStorage.setItem('login_notice', 'Please login as Instructor to continue.');
    router.navigateByUrl('/login');
    return false;
  }

  // Allow Instructor OR OrgAdmin 
  const ok = auth.hasRole('Instructor') || auth.hasRole('OrgAdmin');

  // Admin should NOT access instructor pages
  if (!ok) {
    sessionStorage.setItem('login_notice', 'You do not have permission to access that page.');
    router.navigateByUrl('/home');
    return false;
  }

  return true;
};