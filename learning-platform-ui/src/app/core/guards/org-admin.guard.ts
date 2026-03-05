import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { Auth } from '../services/auth';

export const orgAdminGuard: CanActivateFn = (route, state) => {
  const auth = inject(Auth);
  const router = inject(Router);

  if (!auth.isLoggedIn()) {
    sessionStorage.setItem('return_url', state.url);
    sessionStorage.setItem('login_notice', 'Please login as Organization Admin to continue.');
    router.navigateByUrl('/login');
    return false;
  }

  if (!auth.hasRole('OrgAdmin')) {
    sessionStorage.setItem('return_url', '/me');
    sessionStorage.setItem('login_notice', 'You do not have permission to access that page.');
    router.navigateByUrl('/home');
    return false;
  }

  return true;
};