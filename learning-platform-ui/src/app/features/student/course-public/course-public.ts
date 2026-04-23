import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { BehaviorSubject, Observable, Subject, combineLatest, of } from 'rxjs';
import { catchError, map, shareReplay, startWith, switchMap, tap } from 'rxjs/operators';
import { DomSanitizer } from '@angular/platform-browser';
import { FormBuilder, FormControl, ReactiveFormsModule } from '@angular/forms';

import {
  StudentApi,
  CoursePublic,
  ReviewItem,
  ReviewListResponse,
  UpsertReviewPayload,
} from '../../../core/services/student-api';
import { ToastService } from '../../../shared/ui/toast.service';
import { Auth } from '../../../core/services/auth';
import { AcademyBrandService } from '../../../core/services/academy-brand.service';
import { environment } from '../../../../environments/environment';

type LoadState<T> = { loading: boolean; data: T | null; error: string | null };

type CourseVm = CoursePublic & {
  modulesCount: number;
  lessonsCount: number;
  previewLessonsCount: number;
  safeFullDescription: string | null;
};

type ReviewsVm = {
  summary: { avgRating: number; count: number };
  items: ReviewItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  mine: ReviewItem | null;
};

@Component({
  selector: 'app-course-public',
  standalone: true,
  imports: [CommonModule, RouterModule, ReactiveFormsModule],
  templateUrl: './course-public.html',
  styleUrl: './course-public.scss',
})
export class CoursePublicComponent implements OnDestroy {
  api = environment.apiBaseUrl;
  id = '';

  private destroy$ = new Subject<void>();
  private reload$ = new BehaviorSubject<void>(undefined);
  state$: Observable<LoadState<CourseVm>>;

  enrolling = false;
  startingCheckout = false;

  private currentVm: CourseVm | null = null;

  // Branding
  brandColor = '#7c3aed';
  brandFontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
  private customFontStyleId = 'alef-course-font-style';

  // Curriculum accordion
  expanded = new Set<string>();

  // Reviews
  reviewsPage = 1;
  reviewsPageSize = 8;
  private reviewsReload$ = new BehaviorSubject<void>(undefined);
  reviewsState$: Observable<LoadState<ReviewsVm>>;
  reviewSubmitting = false;
  ratingCtrl: FormControl<number>;
  commentCtrl: FormControl<string>;

  get isLoggedIn(): boolean {
    return !!this.auth.isLoggedIn?.();
  }

  constructor(
    private route: ActivatedRoute,
    private student: StudentApi,
    private toast: ToastService,
    private auth: Auth,
    private router: Router,
    private sanitizer: DomSanitizer,
    private fb: FormBuilder,
    private academyBrandService: AcademyBrandService,
  ) {
    this.id = this.route.snapshot.paramMap.get('id') || '';

    // ── Course state ──────────────────────────────────────────
    this.state$ = this.reload$.pipe(
      switchMap(() =>
        this.student.coursePublic(this.id).pipe(
          tap((res) => {
            this.applyBrandingFromCourse(res);
            // ▶ Push academy brand to the shared service so the topbar
            //   can show the correct logo/name even though the URL has
            //   no academy slug (it only has the course id).
            this.broadcastAcademyBrand(res);
          }),
          map((res) => this.toVm(res)),
          tap((vm) => {
            this.currentVm = vm;
            this.expandFirstModule(vm);
          }),
          map((vm) => ({ loading: false, data: vm, error: null } as LoadState<CourseVm>)),
          startWith({ loading: true, data: null, error: null } as LoadState<CourseVm>),
          catchError((err) => {
            const msg =
              typeof err?.error === 'string'
                ? err.error
                : `Failed to load course: ${err?.status ?? ''} ${err?.statusText ?? ''}`.trim();
            return of({ loading: false, data: null, error: msg } as LoadState<CourseVm>);
          })
        )
      ),
      shareReplay(1)
    );

    // ── Review form ───────────────────────────────────────────
    this.ratingCtrl = this.fb.control(5, { nonNullable: true });
    this.commentCtrl = this.fb.control('', { nonNullable: true });

    // ── Reviews state ─────────────────────────────────────────
    this.reviewsState$ = this.reviewsReload$.pipe(
      switchMap(() => {
        const list$ = this.student.listCourseReviews(this.id, this.reviewsPage, this.reviewsPageSize);
        const my$ = this.isLoggedIn
          ? this.student.getMyCourseReview(this.id).pipe(catchError(() => of(null)))
          : of(null);

        return combineLatest([list$, my$]).pipe(
          map(([res, mine]) => this.toReviewsVm(res, mine)),
          tap((vm) => this.prefillMyReview(vm.mine)),
          map((vm) => ({ loading: false, data: vm, error: null } as LoadState<ReviewsVm>)),
          startWith({ loading: true, data: null, error: null } as LoadState<ReviewsVm>),
          catchError((err) => {
            const msg =
              typeof err?.error === 'string'
                ? err.error
                : `Failed to load reviews: ${err?.status ?? ''} ${err?.statusText ?? ''}`.trim();
            return of({ loading: false, data: null, error: msg } as LoadState<ReviewsVm>);
          })
        );
      }),
      shareReplay(1)
    );

    this.load();
    this.loadReviews();
  }

  ngOnDestroy(): void {
    this.clearCustomFontStyle();
    // Clear the brand signal when leaving the course page
    this.academyBrandService.clear();
    this.destroy$.next();
    this.destroy$.complete();
  }

  load() { this.reload$.next(); }
  reload() { this.load(); }

  img(url?: string | null) {
    if (!url) return null;
    return url.startsWith('http') ? url : `${this.api}${url}`;
  }

  subtitle(c: CourseVm) {
    return (c.shortDescription || '').trim() || 'No short description yet.';
  }

  categoryLabel(c: CoursePublic) {
    return (c.category || '').trim() || 'General';
  }

  tags(c: CoursePublic): string[] {
    const raw = (c.tagsJson || '').trim();
    if (!raw) return [];
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.map((x) => String(x)).filter(Boolean) : [];
    } catch {
      return raw.split(',').map((x) => x.trim()).filter(Boolean);
    }
  }

  priceLabel(c: CourseVm) {
    return c.isFree ? 'Free' : `${c.price ?? 0} ${c.currency ?? 'EUR'}`;
  }

  // ── Broadcast academy brand to layout topbar ──────────────
  private broadcastAcademyBrand(course: any): void {
    const a = course?.academy;
    if (!a?.slug) return;

    this.academyBrandService.set({
      slug: a.slug,
      name: a.name || '',
      orgName: a.orgName ?? null,
      logoUrl: a.logoUrl ?? null,
      primaryColor: a.primaryColor ?? null,
    });
  }

  // ── Academy membership ────────────────────────────────────
  private academyIdFromToken(): string | null {
    try {
      const token: string =
        (this.auth as any).getToken?.() ??
        localStorage.getItem('access_token') ??
        '';
      if (!token) return null;
      const payload = JSON.parse(atob(token.split('.')[1]));
      return (payload?.academyId as string) ?? null;
    } catch {
      return null;
    }
  }

  private isRegisteredInAcademy(c: CourseVm): boolean {
    const myId = this.academyIdFromToken();
    if (!myId) return false;
    return myId === c.academy?.id;
  }

  // ── CTA ───────────────────────────────────────────────────
  ctaLabel(c: CourseVm): string {
    if (this.startingCheckout) return 'Redirecting…';
    if (this.enrolling) return 'Enrolling…';
    if (!this.isLoggedIn) return 'Register to Enroll';
    if (!this.isRegisteredInAcademy(c)) return 'Register to Enroll';
    if (!c.isFree) return 'Buy now';
    return 'Enroll now — Free';
  }

  ctaIsRegister(c: CourseVm): boolean {
    return !this.isLoggedIn || !this.isRegisteredInAcademy(c);
  }

  canEnroll(_c: CourseVm): boolean {
    return !this.enrolling && !this.startingCheckout;
  }

  enroll(courseId: string) {
    const vm = this.currentVm;
    const slug = vm?.academy?.slug ?? '';

    if (!vm) { this.toast.error('Course data is not ready yet.'); return; }

    if (!this.isLoggedIn) {
      sessionStorage.setItem('return_url', `/course/${courseId}`);
      sessionStorage.setItem('login_notice', 'Please log in to enroll in this course.');
      this.router.navigateByUrl(slug ? `/login-academy?academy=${slug}` : '/login');
      return;
    }

    if (!this.isRegisteredInAcademy(vm)) {
      sessionStorage.setItem('return_url', `/course/${courseId}`);
      this.router.navigateByUrl(slug ? `/register-student?academy=${slug}` : '/register');
      return;
    }

    if (!vm.isFree) { this.startCheckout(courseId); return; }

    this.enrolling = true;
    this.student.enroll(courseId).subscribe({
      next: () => {
        this.enrolling = false;
        this.toast.success('Enrolled! Opening My Learning…');
        this.router.navigateByUrl('/my-learning');
      },
      error: (err) => {
        this.enrolling = false;
        this.toast.error(typeof err?.error === 'string' ? err.error : 'Enroll failed.');
      },
    });
  }

  private startCheckout(courseId: string) {
    if (this.startingCheckout) return;
    this.startingCheckout = true;

    this.student.createCheckoutSession(courseId).subscribe({
      next: (res) => {
        if (!res?.url) {
          this.startingCheckout = false;
          this.toast.error('Checkout session was created, but no redirect URL was returned.');
          return;
        }
        window.location.href = res.url;
      },
      error: (err) => {
        this.startingCheckout = false;
        this.toast.error(typeof err?.error === 'string' ? err.error : 'Unable to start checkout.');
      },
    });
  }

  // ── Curriculum helpers ────────────────────────────────────
  hasPreviewLessons(m: any): boolean {
    return (Array.isArray(m?.lessons) ? m.lessons : []).some((l: any) => !!l?.isPreviewFree);
  }

  lessonCount(m: any): number {
    return (Array.isArray(m?.lessons) ? m.lessons : []).length;
  }

  moduleKey(title: string, idx: number) { return `${idx}:${title || 'module'}`; }
  isExpanded(key: string) { return this.expanded.has(key); }

  toggleModule(key: string) {
    if (this.expanded.has(key)) this.expanded.delete(key);
    else this.expanded.add(key);
  }

  expandAll(vm: CourseVm) {
    this.expanded.clear();
    (vm.modules || []).forEach((m, i) => this.expanded.add(this.moduleKey(m.title, i)));
  }

  collapseAll() { this.expanded.clear(); }

  private expandFirstModule(vm: CourseVm) {
    if (this.expanded.size > 0 || !vm?.modules?.length) return;
    this.expanded.add(this.moduleKey(vm.modules[0].title, 0));
  }

  // ── Build VM ──────────────────────────────────────────────
  private toVm(res: CoursePublic): CourseVm {
    const modules = (res?.modules || []) as any[];
    let lessonsCount = 0;
    let previewLessonsCount = 0;

    for (const m of modules) {
      const lessons = Array.isArray(m?.lessons) ? m.lessons : [];
      lessonsCount += lessons.length;
      previewLessonsCount += lessons.filter((l: any) => !!l?.isPreviewFree).length;
    }

    const raw = (res?.fullDescription || '').trim();
    const safe = raw ? (this.sanitizer.sanitize(1 as any, raw) || '') : null;

    return {
      ...(res as any),
      modulesCount: modules.length,
      lessonsCount,
      previewLessonsCount,
      safeFullDescription: safe,
    };
  }

  // ── Branding (page-level font + color, separate from topbar) ──
  private applyBrandingFromCourse(course: any) {
    if (!course?.academy) return;
    const a = course.academy;
    this.brandColor = a.primaryColor || '#7c3aed';
    const fontKey = (a.fontKey || 'system').toLowerCase();
    const customFontUrl = a.customFontUrl as string | null;
    const customFamily = (a.customFontFamily || 'AlefCustomFont') as string;

    this.clearCustomFontStyle();

    if (fontKey === 'custom' && customFontUrl) {
      this.injectFontFace(customFamily, this.img(customFontUrl) || '');
      this.brandFontFamily = `'${customFamily}', system-ui, sans-serif`;
      return;
    }

    this.brandFontFamily = this.fontCss(fontKey);
  }

  private fontCss(fontKey: string): string {
    const map: Record<string, string> = {
      inter: 'Inter, system-ui, sans-serif',
      poppins: 'Poppins, system-ui, sans-serif',
      cairo: 'Cairo, system-ui, sans-serif',
      tajawal: 'Tajawal, system-ui, sans-serif',
      ibmplexar: '"IBM Plex Sans Arabic", system-ui, sans-serif',
    };
    return map[fontKey] ?? 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
  }

  private injectFontFace(family: string, url: string) {
    if (!url) return;
    const lower = url.toLowerCase();
    const format = lower.endsWith('.woff2') ? 'woff2'
      : lower.endsWith('.woff') ? 'woff'
      : lower.endsWith('.otf') ? 'opentype'
      : 'truetype';

    const style = document.createElement('style');
    style.id = this.customFontStyleId;
    style.textContent = `@font-face { font-family: '${family}'; src: url('${url}') format('${format}'); font-display: swap; }`;
    document.head.appendChild(style);
  }

  private clearCustomFontStyle() {
    document.getElementById(this.customFontStyleId)?.remove();
  }

  // ── Reviews ───────────────────────────────────────────────
  private toReviewsVm(res: ReviewListResponse, mine: ReviewItem | null): ReviewsVm {
    const total = res?.total ?? (res?.items?.length ?? 0);
    const page = res?.page ?? this.reviewsPage;
    const pageSize = res?.pageSize ?? this.reviewsPageSize;
    const totalPages = Math.max(1, Math.ceil((total || 0) / (pageSize || 1)));

    return {
      summary: {
        avgRating: Number(res?.summary?.avgRating ?? 0),
        count: Number(res?.summary?.count ?? total ?? 0),
      },
      items: (res?.items ?? []) as ReviewItem[],
      page,
      pageSize,
      total,
      totalPages,
      mine: (res as any)?.myReview ?? mine ?? null,
    };
  }

  private prefillMyReview(mine: ReviewItem | null) {
    if (!mine) return;
    if (!(this.commentCtrl.value || '').trim()) {
      this.commentCtrl.setValue((mine.comment || '').trim());
    }
    const r = Number(mine.rating || 0);
    if (r >= 1 && r <= 5) this.ratingCtrl.setValue(r);
  }

  loadReviews() { this.reviewsReload$.next(); }

  reviewsPrev(_vm: ReviewsVm) {
    if (this.reviewsPage <= 1) return;
    this.reviewsPage--;
    this.loadReviews();
  }

  reviewsNext(vm: ReviewsVm) {
    if (this.reviewsPage >= vm.totalPages) return;
    this.reviewsPage++;
    this.loadReviews();
  }

  stars(n: number): string[] {
    const v = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
    return Array.from({ length: 5 }).map((_, i) => (i < v ? '★' : '☆'));
  }

  displayName(r: ReviewItem): string {
    return (r.userDisplayName || '').trim() || (r.userEmailMasked || '').trim() || 'Student';
  }

  initial(r: ReviewItem): string {
    return (this.displayName(r) || 'S').slice(0, 1).toUpperCase();
  }

  when(v?: string | null): string {
    if (!v) return '';
    const t = Date.parse(v);
    return Number.isFinite(t) ? new Date(t).toLocaleDateString() : '';
  }

  goLoginForReview() {
    const slug = this.currentVm?.academy?.slug ?? '';
    sessionStorage.setItem('return_url', `/course/${this.id}`);
    sessionStorage.setItem('login_notice', 'Please login as Student to write a review.');
    this.router.navigateByUrl(slug ? `/login-academy?academy=${slug}` : '/login');
  }

  submitReview() {
    if (!this.isLoggedIn) { this.goLoginForReview(); return; }
    if (this.reviewSubmitting) return;

    const rating = Number(this.ratingCtrl.value || 0);
    const comment = (this.commentCtrl.value || '').trim();

    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      this.toast.error('Rating must be between 1 and 5.');
      return;
    }

    const payload: UpsertReviewPayload = {
      rating,
      comment: comment.length ? comment : null,
    };

    this.reviewSubmitting = true;
    this.student.upsertCourseReview(this.id, payload).subscribe({
      next: () => {
        this.reviewSubmitting = false;
        this.toast.success('Review saved.');
        this.loadReviews();
      },
      error: (err) => {
        this.reviewSubmitting = false;
        this.toast.error(typeof err?.error === 'string' ? err.error : 'Failed to save review.');
      },
    });
  }
}