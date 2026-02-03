import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map, shareReplay, startWith, switchMap, tap } from 'rxjs/operators';
import { StudentApi, CoursePublic } from '../../../core/services/student-api';
import { ToastService } from '../../../shared/ui/toast.service';
import { Auth } from '../../../core/services/auth';
import { environment } from '../../../../environments/environment';

type LoadState<T> = { loading: boolean; data: T | null; error: string | null };

@Component({
  selector: 'app-course-public',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './course-public.html',
  styleUrl: './course-public.scss',
})
export class CoursePublicComponent implements OnDestroy {
  api = environment.apiBaseUrl;
  id = '';

  private reload$ = new BehaviorSubject<void>(undefined);
  state$: Observable<LoadState<CoursePublic>>;

  enrolling = false;

  // Branding
  brandColor = '#7c3aed';
  brandFontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';

  private customFontStyleId = 'alef-course-font-style';

  constructor(
    private route: ActivatedRoute,
    private student: StudentApi,
    private toast: ToastService,
    private auth: Auth,
    private router: Router
  ) {
    this.id = this.route.snapshot.paramMap.get('id') || '';

    this.state$ = this.reload$.pipe(
      switchMap(() =>
        this.student.coursePublic(this.id).pipe(
          tap((res) => this.applyBrandingFromCourse(res)),
          map((res) => ({ loading: false, data: res, error: null } as LoadState<CoursePublic>)),
          startWith({ loading: true, data: null, error: null } as LoadState<CoursePublic>),
          catchError((err) => {
            // ✅ If backend returns a string reason (e.g. hidden by admin), show it directly
            const msg =
              typeof err?.error === 'string'
                ? err.error
                : `Failed to load course: ${err?.status ?? ''} ${err?.statusText ?? ''}`.trim();

            return of({ loading: false, data: null, error: msg } as LoadState<CoursePublic>);
          })
        )
      ),
      shareReplay(1)
    );
  }

  ngOnDestroy(): void {
    this.clearCustomFontStyle();
  }

  img(url?: string | null) {
    if (!url) return null;
    // supports relative urls
    return url.startsWith('http') ? url : `${this.api}${url}`;
  }

  priceLabel(c: CoursePublic) {
    return c.isFree ? 'Free' : `${c.price ?? 0} ${c.currency ?? 'EUR'}`;
  }

  ctaLabel(c: CoursePublic) {
    if (this.enrolling) return 'Enrolling…';
    if (c.isFree) return 'Enroll (Free)';
    return 'Paid (PayPal next)';
  }

  canEnroll(c: CoursePublic) {
    return c.isFree; // only free for now
  }

  async enroll(courseId: string) {
    // ✅ If not logged in, store return_url so user comes back to this course after login
    if (!this.auth.isLoggedIn?.()) {
      sessionStorage.setItem('return_url', `/course/${courseId}`);
      sessionStorage.setItem('login_notice', 'Please login as Student to enroll.');
      this.router.navigateByUrl('/login');
      return;
    }

    this.enrolling = true;

    this.student.enroll(courseId).subscribe({
      next: () => {
        this.enrolling = false;
        this.toast.success('Enrolled! Opening My Learning…');
        this.router.navigateByUrl('/my-learning');
      },
      error: (err) => {
        this.enrolling = false;
        const msg = typeof err?.error === 'string' ? err.error : 'Enroll failed.';
        this.toast.error(msg);
      }
    });
  }

  // -------- Branding ----------
  private applyBrandingFromCourse(course: any) {
    if (!course?.academy) return;

    const academy = course.academy;

    // Color
    this.brandColor = academy.primaryColor || '#7c3aed';

    // Font
    const fontKey = (academy.fontKey || 'system').toLowerCase();
    const customFontUrl = academy.customFontUrl as string | null;
    const customFontFamily = (academy.customFontFamily || 'AlefCustomFont') as string;

    this.clearCustomFontStyle();

    if (fontKey === 'custom' && customFontUrl) {
      const absolute = this.img(customFontUrl) || '';
      this.injectFontFace(customFontFamily, absolute);
      this.brandFontFamily = `'${customFontFamily}', system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
      return;
    }

    this.brandFontFamily = this.fontCss(fontKey);
  }

  private fontCss(fontKey: string): string {
    switch (fontKey) {
      case 'inter':
        return `Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
      case 'poppins':
        return `Poppins, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
      case 'cairo':
        return `Cairo, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
      case 'tajawal':
        return `Tajawal, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
      case 'ibmplexar':
        return `"IBM Plex Sans Arabic", system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
      default:
        return `system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
    }
  }

  private injectFontFace(family: string, url: string) {
    if (!url) return;

    const lower = url.toLowerCase();
    const format =
      lower.endsWith('.woff2') ? 'woff2' :
      lower.endsWith('.woff') ? 'woff' :
      lower.endsWith('.otf') ? 'opentype' :
      'truetype';

    const css = `
@font-face {
  font-family: '${family}';
  src: url('${url}') format('${format}');
  font-display: swap;
}
`;

    const style = document.createElement('style');
    style.id = this.customFontStyleId;
    style.textContent = css;
    document.head.appendChild(style);
  }

  private clearCustomFontStyle() {
    const el = document.getElementById(this.customFontStyleId);
    if (el) el.remove();
  }
}
