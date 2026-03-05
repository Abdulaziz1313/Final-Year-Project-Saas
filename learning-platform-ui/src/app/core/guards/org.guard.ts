import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree, RouterStateSnapshot, ActivatedRouteSnapshot } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { OrgApi } from '../services/org-api';
import { Auth } from '../services/auth';

@Injectable({ providedIn: 'root' })
export class OrgGuard implements CanActivate {
  constructor(
    private orgApi: OrgApi,
    private auth: Auth,
    private router: Router
  ) {}

  async canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Promise<boolean | UrlTree> {
    if (!this.auth.isLoggedIn()) {
      sessionStorage.setItem('return_url', state.url);
      return this.router.createUrlTree(['/login']);
    }

    // Loop protection: if OrgAdmin is already going to org area, don't bounce forever.
    const goingToOrgMembers = state.url.startsWith('/org/members');
    if (goingToOrgMembers && this.auth.hasRole('OrgAdmin')) {
      return true;
    }

    try {
      const me = await firstValueFrom(this.orgApi.getMyOrg());
      const org = me?.organization ?? null;

      // no org assigned
      if (!org) {
        if (this.auth.hasRole('Instructor')) {
          return this.router.createUrlTree(['/join-org']);
        }

        if (this.auth.hasRole('OrgAdmin')) {
          // If they reach here, they are NOT already on /org/members
          return this.router.createUrlTree(['/org/members'], { queryParams: { setup: '1' } });
        }

        return this.router.createUrlTree(['/me']);
      }

      // org disabled
      if (org.isActive === false) {
        if (this.auth.hasRole('Instructor')) {
          return this.router.createUrlTree(['/join-org'], { queryParams: { disabled: '1' } });
        }

        if (this.auth.hasRole('OrgAdmin')) {
          return this.router.createUrlTree(['/org/members'], { queryParams: { disabled: '1' } });
        }

        return this.router.createUrlTree(['/me']);
      }

      return true;
    } catch {
      sessionStorage.setItem('return_url', state.url);
      return this.router.createUrlTree(['/login']);
    }
  }
}