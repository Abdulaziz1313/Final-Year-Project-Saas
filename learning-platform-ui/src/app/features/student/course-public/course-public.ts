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

  // Branding
  brandColor = '#7c3aed';
  brandFontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';
  private customFontStyleId = 'alef-course-font-style';

  // Curriculum accordion
  expanded = new Set<string>();

  /* =========================
     ✅ Reviews (NEW)
  ========================= */

  reviewsPage = 1;
  reviewsPageSize = 8;

  private reviewsReload$ = new BehaviorSubject<void>(undefined);

  reviewsState$: Observable<LoadState<ReviewsVm>>;
  reviewSubmitting = false;

  ratingCtrl: FormControl<number>;
  commentCtrl: FormControl<string>;

  // ✅ Template-safe login flag (fixes: "auth is private" + removes optional chaining warning)
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
    private fb: FormBuilder
  ) {
    this.id = this.route.snapshot.paramMap.get('id') || '';

    // course state
    this.state$ = this.reload$.pipe(
      switchMap(() =>
        this.student.coursePublic(this.id).pipe(
          tap((res) => this.applyBrandingFromCourse(res)),
          map((res) => this.toVm(res)),
          tap((vm) => this.expandFirstModule(vm)),
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

    // review form
    this.ratingCtrl = this.fb.control(5, { nonNullable: true });
    this.commentCtrl = this.fb.control('', { nonNullable: true });

    // reviews state
    this.reviewsState$ = this.reviewsReload$.pipe(
      switchMap(() => {
        const list$ = this.student.listCourseReviews(this.id, this.reviewsPage, this.reviewsPageSize);

        // optional: prefill "my review" if logged in
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

    // initial loads
    this.load();
    this.loadReviews();
  }

  ngOnDestroy(): void {
    this.clearCustomFontStyle();
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ---------------- core loads ----------------
  load() {
    this.reload$.next();
  }

  reload() {
    this.load();
  }

  // ---------------- images / labels ----------------
  img(url?: string | null) {
    if (!url) return null;
    return url.startsWith('http') ? url : `${this.api}${url}`;
  }

  subtitle(c: CourseVm) {
    return (c.shortDescription || '').trim() || 'No short description yet.';
  }

  categoryLabel(c: CoursePublic): string {
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

  ctaLabel(c: CourseVm) {
    if (this.enrolling) return 'Enrolling…';
    if (c.isFree) return 'Enroll now (Free)';
    return 'Paid (PayPal next)';
  }

  canEnroll(c: CourseVm) {
    return c.isFree; // only free for now
  }

  enroll(courseId: string) {
    if (!this.isLoggedIn) {
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
      },
    });
  }

  // ---------------- Curriculum helpers ----------------
  hasPreviewLessons(m: any): boolean {
    const lessons = Array.isArray(m?.lessons) ? m.lessons : [];
    return lessons.some((l: any) => !!l?.isPreviewFree);
  }

  lessonCount(m: any): number {
    const lessons = Array.isArray(m?.lessons) ? m.lessons : [];
    return lessons.length;
  }

  moduleKey(title: string, idx: number) {
    return `${idx}:${title || 'module'}`;
  }

  isExpanded(key: string) {
    return this.expanded.has(key);
  }

  toggleModule(key: string) {
    if (this.expanded.has(key)) this.expanded.delete(key);
    else this.expanded.add(key);
  }

  expandAll(vm: CourseVm) {
    this.expanded.clear();
    (vm.modules || []).forEach((m, i) => this.expanded.add(this.moduleKey(m.title, i)));
  }

  collapseAll() {
    this.expanded.clear();
  }

  private expandFirstModule(vm: CourseVm) {
    if (this.expanded.size > 0) return;
    if (!vm?.modules?.length) return;
    this.expanded.add(this.moduleKey(vm.modules[0].title, 0));
  }

  // ---------------- Build VM ----------------
  private toVm(res: CoursePublic): CourseVm {
    const modules = (res?.modules || []) as any[];
    const modulesCount = modules.length;

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
      modulesCount,
      lessonsCount,
      previewLessonsCount,
      safeFullDescription: safe,
    };
  }

  // ---------------- Branding ----------------
  private applyBrandingFromCourse(course: any) {
    if (!course?.academy) return;

    const academy = course.academy;

    this.brandColor = academy.primaryColor || '#7c3aed';

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

  /* =========================
     ✅ Reviews logic
  ========================= */

  private toReviewsVm(res: ReviewListResponse, mine: ReviewItem | null): ReviewsVm {
    const total = res?.total ?? (res?.items?.length ?? 0);
    const page = res?.page ?? this.reviewsPage;
    const pageSize = res?.pageSize ?? this.reviewsPageSize;
    const totalPages = Math.max(1, Math.ceil((total || 0) / (pageSize || 1)));

    const avg = Number(res?.summary?.avgRating ?? 0);
    const count = Number(res?.summary?.count ?? total ?? 0);

    return {
      summary: { avgRating: avg, count },
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

    // only prefill if user hasn't typed something
    const currentComment = (this.commentCtrl.value || '').trim();
    if (!currentComment) this.commentCtrl.setValue((mine.comment || '').trim());

    const r = Number(mine.rating || 0);
    if (r >= 1 && r <= 5) this.ratingCtrl.setValue(r);
  }

  loadReviews() {
    this.reviewsReload$.next();
  }

  reviewsPrev(vm: ReviewsVm) {
    if (this.reviewsPage <= 1) return;
    this.reviewsPage -= 1;
    this.loadReviews();
  }

  reviewsNext(vm: ReviewsVm) {
    if (this.reviewsPage >= vm.totalPages) return;
    this.reviewsPage += 1;
    this.loadReviews();
  }

  stars(n: number): string[] {
    const v = Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
    return Array.from({ length: 5 }).map((_, i) => (i < v ? '★' : '☆'));
  }

  displayName(r: ReviewItem): string {
    const dn = (r.userDisplayName || '').trim();
    if (dn) return dn;

    const masked = (r.userEmailMasked || '').trim();
    if (masked) return masked;

    return 'Student';
  }

  initial(r: ReviewItem): string {
    const name = this.displayName(r);
    return (name || 'S').slice(0, 1).toUpperCase();
  }

  when(v?: string | null): string {
    if (!v) return '';
    const t = Date.parse(v);
    if (!Number.isFinite(t)) return '';
    return new Date(t).toLocaleDateString();
  }

  goLoginForReview() {
    sessionStorage.setItem('return_url', `/course/${this.id}`);
    sessionStorage.setItem('login_notice', 'Please login as Student to write a review.');
    this.router.navigateByUrl('/login');
  }

  submitReview() {
    if (!this.isLoggedIn) {
      this.goLoginForReview();
      return;
    }

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
        const msg = typeof err?.error === 'string' ? err.error : 'Failed to save review.';
        this.toast.error(msg);
      },
    });
  }
}
