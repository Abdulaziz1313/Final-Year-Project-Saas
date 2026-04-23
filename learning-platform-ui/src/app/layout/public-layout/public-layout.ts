import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { filter, Subscription } from 'rxjs';

import { Auth, AcademyPublicInfo } from '../../core/services/auth';
import { AcademyBrandService, AcademyBrandSignal } from '../../core/services/academy-brand.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-public-layout',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './public-layout.html',
  styleUrl: './public-layout.scss',
})
export class PublicLayoutComponent implements OnDestroy {
  hideTopbar = false;

  // Brand loaded from URL slug (academy-home, academy-catalog, login pages)
  academyBrand: AcademyPublicInfo | null = null;
  academySlug: string | null = null;

  // Brand pushed from course component via AcademyBrandService
  private signalBrand: AcademyBrandSignal | null = null;

  private navSub?: Subscription;
  private academyReqSub?: Subscription;
  private brandSignalSub?: Subscription;

  constructor(
    public auth: Auth,
    private router: Router,
    private academyBrandService: AcademyBrandService,
  ) {
    // Subscribe to brand signals pushed by CoursePublicComponent
    this.brandSignalSub = this.academyBrandService.brand$.subscribe((signal) => {
      this.signalBrand = signal;
    });

    this.syncLayout(this.router.url);

    this.navSub = this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => {
        this.syncLayout(e.urlAfterRedirects || this.router.url);
      });
  }

  ngOnDestroy(): void {
    this.navSub?.unsubscribe();
    this.academyReqSub?.unsubscribe();
    this.brandSignalSub?.unsubscribe();
  }

  private syncLayout(url: string): void {
    const cleanUrl = (url || '').toLowerCase();

    this.hideTopbar =
      this.isHomeRoute(cleanUrl) ||
      this.isAcademyHomeRoute(cleanUrl);

    // NOTE: never clear the signal brand here.
    // The signal is set by CoursePublicComponent when it loads
    // and cleared by CoursePublicComponent in ngOnDestroy.
    // Clearing it here would race against the component loading.

    const slug = this.extractAcademySlugFromUrl(url);

    if (!slug) {
      if (!this.isCourseRoute(cleanUrl)) {
        this.academySlug = null;
        this.academyBrand = null;
        this.academyReqSub?.unsubscribe();
      }
      return;
    }

    if (this.academySlug === slug && this.academyBrand) {
      return;
    }

    this.academySlug = slug;
    this.academyBrand = null;

    this.academyReqSub?.unsubscribe();
    this.academyReqSub = this.auth.getAcademyInfo(slug).subscribe({
      next: (info) => { this.academyBrand = info; },
      error: () => { this.academyBrand = null; },
    });
  }

  private extractAcademySlugFromUrl(url: string): string | null {
    const raw = url || '';

    const academyHomeMatch = raw.match(/(?:#\/|\/)academy-home\/([^/?#]+)/i);
    if (academyHomeMatch?.[1]) return decodeURIComponent(academyHomeMatch[1]).trim();

    const academyPageMatch = raw.match(/(?:#\/|\/)academy\/([^/?#]+)/i);
    if (academyPageMatch?.[1]) return decodeURIComponent(academyPageMatch[1]).trim();

    const queryMatch = raw.match(/[?&]academy=([^&#]+)/i);
    if (queryMatch?.[1]) return decodeURIComponent(queryMatch[1]).trim();

    return null;
  }

  private isHomeRoute(url: string): boolean {
    return (
      url === '/home' || url === '/#/home' ||
      url.startsWith('/home?') || url.startsWith('/#/home?') ||
      url === '/' || url === '/#/' || url === ''
    );
  }

  private isAcademyHomeRoute(url: string): boolean {
    return url.includes('/academy-home/') || url.includes('#/academy-home/');
  }

  private isCourseRoute(url: string): boolean {
    return url.includes('/course/') || url.includes('#/course/');
  }

  // ── Resolved brand ──────────────────────────────────────────────────────────
  // Signal brand (set by CoursePublicComponent) takes priority.
  // Falls back to URL-based brand (academy-home, catalog, login pages).
  // This means when you navigate course → other page, the URL brand
  // takes over naturally as the signal is cleared on course ngOnDestroy.
  private get resolvedBrand(): AcademyPublicInfo | AcademyBrandSignal | null {
    return this.signalBrand ?? this.academyBrand;
  }

  get loggedIn(): boolean { return this.auth.isLoggedIn(); }
  get isStudent(): boolean { return this.auth.hasRole('Student'); }
  get isInstructor(): boolean { return this.auth.hasRole('Instructor'); }
  get isAdmin(): boolean { return this.auth.hasRole('Admin'); }

  get showAcademyBrand(): boolean {
    return !!this.resolvedBrand && !this.hideTopbar;
  }

  // These getters read from resolvedBrand so the template works for both types
  get academyBrandForTemplate(): { slug: string; name: string; orgName?: string | null } | null {
    const b = this.resolvedBrand;
    if (!b) return null;
    return {
      slug: (b as any).slug,
      name: (b as any).name,
      orgName: (b as any).orgName ?? null,
    };
  }

  academyLogoUrl(): string | null {
    const url = (this.resolvedBrand as any)?.logoUrl as string | null | undefined;
    if (!url) return null;
    return url.startsWith('http') ? url : `${environment.apiBaseUrl}${url}`;
  }

  academyInitial(): string {
    return ((this.resolvedBrand as any)?.name || 'A').slice(0, 1).toUpperCase();
  }

  academyAccent(): string {
    return (this.resolvedBrand as any)?.primaryColor || '#7c3aed';
  }

  logout(): void {
    sessionStorage.removeItem('login_notice');
    this.auth.logout();
    this.router.navigateByUrl('/home');
  }
}