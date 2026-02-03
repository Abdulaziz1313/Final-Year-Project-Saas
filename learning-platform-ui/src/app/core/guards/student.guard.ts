import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { Auth } from '../services/auth';

export const studentGuard: CanActivateFn = (route, state) => {
  const auth = inject(Auth);
  const router = inject(Router);

  // not logged in -> go login and remember where user wanted to go
  if (!auth.isLoggedIn()) {
    sessionStorage.setItem('return_url', state.url);
    sessionStorage.setItem('login_notice', 'Please login as Student to continue.');
    router.navigateByUrl('/login');
    return false;
  }

  // logged in but wrong role
  if (!auth.hasRole('Student')) {
    sessionStorage.setItem('login_notice', 'You do not have permission to access that page.');
    router.navigateByUrl('/home');
    return false;
  }

  return true;
};
