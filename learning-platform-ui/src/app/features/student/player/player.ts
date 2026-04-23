import { Component, ViewChild } from '@angular/core';
import { CommonModule, NgStyle } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { catchError, finalize, map, shareReplay, startWith, switchMap, tap } from 'rxjs/operators';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';

import { StudentApi, PlayerCourse, FlashcardDto, StudentAcademy } from '../../../core/services/student-api';
import { ToastService } from '../../../shared/ui/toast.service';
import { environment } from '../../../../environments/environment';
import { QuizPlayerComponent } from './quiz-player/quiz-player';

type LoadState<T> = { loading: boolean; data: T | null; error: string | null };

type FlatLesson = {
  moduleId: string;
  moduleTitle: string;
  id: string;
  title: string;
  type: number;
  contentUrl?: string | null;
  htmlContent?: string | null;
  isPreviewFree: boolean;
  isDownloadable: boolean;
};

@Component({
  selector: 'app-player',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, QuizPlayerComponent, NgStyle],
  templateUrl: './player.html',
  styleUrl: './player.scss',
})
export class PlayerComponent {
  @ViewChild('qp') qp?: QuizPlayerComponent;

  courseId = '';
  private reload$ = new BehaviorSubject<void>(undefined);
  state$: Observable<LoadState<PlayerCourse>>;

  selectedLessonId: string | null = null;
  completing = false;

  completed = new Set<string>();
  apiBase = environment.apiBaseUrl;

  lessonQuery = '';
  sidebarOpen = true;
  isMobile = false;

  academy: StudentAcademy | null = null;

  brandingVars: Record<string, string> = {
    '--accent':        '#1a56db',
    '--accent-light':  '#eff4ff',
    '--accent-glow':   'rgba(26, 86, 219, 0.12)',
    '--accent-soft':   'rgba(26, 86, 219, 0.08)',
    '--accent-strong': '#3b82f6',
  };

  private moduleOpen = new Map<string, boolean>();

  flashcardsByLesson = new Map<string, FlashcardDto[]>();
  flashcardsLoading = new Set<string>();
  flashcardFlips = new Map<string, Set<number>>();

  constructor(
    private route: ActivatedRoute,
    private student: StudentApi,
    private toast: ToastService,
    private sanitizer: DomSanitizer
  ) {
    this.courseId = this.route.snapshot.paramMap.get('courseId') || '';

    this.loadAcademyBranding();

    this.updateMobile();
    window.addEventListener('resize', () => this.updateMobile());

    this.state$ = this.reload$.pipe(
      switchMap(() =>
        this.student.courseContent(this.courseId).pipe(
          tap((res) => {
            const ids = (res as any)?.completedLessonIds as string[] | undefined;
            this.completed = new Set(ids ?? []);

            for (const m of res.modules ?? []) {
              if (!this.moduleOpen.has(m.id)) this.moduleOpen.set(m.id, true);
            }

            // FIX 1: Use lastLessonId to resume where the student left off.
            // Previously this block only set selectedLessonId when lastLessonId
            // was absent, meaning returning students always restarted at lesson 1.
            if (!this.selectedLessonId) {
              const resumeId = res.lastLessonId || this.firstLessonId(res);
              if (resumeId) {
                this.selectedLessonId = resumeId;
                // Only persist if it wasn't already saved server-side
                if (!res.lastLessonId) {
                  this.bestEffortSetLastLesson(res.id, resumeId);
                }
              }
            }

            const active = this.currentLesson(res);
            if (active) {
              this.ensureFlashcardsLoaded(active);
            }

            if (this.isMobile) this.sidebarOpen = false;
          }),
          map((res) => ({ loading: false, data: res, error: null } as LoadState<PlayerCourse>)),
          startWith({ loading: true, data: null, error: null } as LoadState<PlayerCourse>),
          catchError((err) =>
            of({
              loading: false,
              data: null,
              error:
                typeof err?.error === 'string'
                  ? err.error
                  : `Failed to load course: ${err?.status ?? ''} ${err?.statusText ?? ''}`.trim(),
            } as LoadState<PlayerCourse>)
          )
        )
      ),
      shareReplay(1)
    );
  }

  private loadAcademyBranding() {
    this.student.myAcademy().subscribe({
      next: (academy) => {
        this.academy = academy ?? null;
        this.applyBranding(academy?.primaryColor || null);
      },
      error: () => {
        this.academy = null;
        this.applyBranding(null);
      },
    });
  }

  private applyBranding(color?: string | null) {
    const accent = this.normalizeHex(color) || '#1a56db';
    const accentStrong = this.mixHex(accent, '#ffffff', 0.18);
    // FIX 2: --accent-light must be a solid color (used as element backgrounds).
    // Previously hexToRgba(accent, 0.10) produced an rgba() value which broke
    // any element that needed an opaque background (e.g. badges, pill buttons).
    const accentLight = this.mixHex(accent, '#ffffff', 0.90);

    this.brandingVars = {
      '--accent':        accent,
      '--accent-light':  accentLight,
      '--accent-glow':   this.hexToRgba(accent, 0.12),
      '--accent-soft':   this.hexToRgba(accent, 0.08),
      '--accent-strong': accentStrong,
    };
  }

  academyLogoUrl(): string | null {
    return this.assetUrl(this.academy?.logoUrl || null);
  }

  academyInitials(): string {
    const name = (this.academy?.name || 'Alef').trim();
    const parts = name.split(/\s+/).filter(Boolean);
    if (!parts.length) return 'A';
    if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  private updateMobile() {
    this.isMobile = window.innerWidth <= 980;
    if (!this.isMobile) this.sidebarOpen = true;
  }

  toggleSidebar(force?: boolean) {
    this.sidebarOpen = typeof force === 'boolean' ? force : !this.sidebarOpen;
  }

  reload() {
    this.reload$.next();
  }

  n(v: any): number {
    return Number(v);
  }

  assetUrl(url?: string | null): string | null {
    if (!url) return null;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return this.apiBase + url;
  }

  safePdfUrl(docUrl: string): SafeResourceUrl {
    const withParams = docUrl.includes('#') ? docUrl : `${docUrl}#toolbar=0&navpanes=0&scrollbar=0`;
    return this.sanitizer.bypassSecurityTrustResourceUrl(withParams);
  }

  isVideo(type: any) { return this.n(type) === 0; }
  isDoc(type: any)   { return this.n(type) === 1; }
  isText(type: any)  { return this.n(type) === 2; }
  isQuiz(t: any): boolean { return Number(t) === 3; }

  flat(course: PlayerCourse | null): FlatLesson[] {
    if (!course) return [];
    const out: FlatLesson[] = [];
    for (const m of course.modules ?? []) {
      for (const l of m.lessons ?? []) {
        out.push({
          moduleId:      m.id,
          moduleTitle:   m.title,
          id:            l.id,
          title:         l.title,
          type:          this.n(l.type),
          contentUrl:    (l as any).contentUrl ?? null,
          htmlContent:   (l as any).htmlContent ?? null,
          isPreviewFree: !!(l as any).isPreviewFree,
          isDownloadable:!!(l as any).isDownloadable,
        });
      }
    }
    return out;
  }

  filteredModules(course: PlayerCourse): any[] {
    const q = (this.lessonQuery || '').trim().toLowerCase();
    if (!q) return course.modules ?? [];

    const out = [];
    for (const m of course.modules ?? []) {
      const lessons = (m.lessons ?? []).filter((l: any) =>
        (l.title || '').toLowerCase().includes(q)
      );
      if (lessons.length) out.push({ ...m, lessons });
    }
    return out;
  }

  toggleModule(moduleId: string) {
    const cur = this.moduleOpen.get(moduleId);
    this.moduleOpen.set(moduleId, !cur);
  }

  isModuleOpen(moduleId: string): boolean {
    return this.moduleOpen.get(moduleId) ?? true;
  }

  moduleTitleForLesson(course: PlayerCourse, lessonId: string): string {
    for (const m of course.modules ?? []) {
      if ((m.lessons ?? []).some((l: any) => l.id === lessonId)) return m.title;
    }
    return 'Module';
  }

  firstLessonId(course: PlayerCourse | null): string | null {
    const all = this.flat(course);
    return all.length ? all[0].id : null;
  }

  activeLessonId(course: PlayerCourse | null): string | null {
    const all = this.flat(course);
    if (!all.length) return null;

    const want = this.selectedLessonId || course?.lastLessonId || all[0].id;
    const exists = all.some((l) => l.id === want);
    return exists ? want : all[0].id;
  }

  currentLesson(course: PlayerCourse | null): FlatLesson | null {
    const all = this.flat(course);
    if (!all.length) return null;
    const id = this.activeLessonId(course);
    return all.find((l) => l.id === id) || all[0];
  }

  currentIndex(course: PlayerCourse | null): number {
    const all = this.flat(course);
    const id = this.activeLessonId(course);
    return Math.max(0, all.findIndex((l) => l.id === id));
  }

  hasPrev(course: PlayerCourse | null): boolean {
    return this.currentIndex(course) > 0;
  }

  hasNext(course: PlayerCourse | null): boolean {
    const all = this.flat(course);
    return this.currentIndex(course) < all.length - 1;
  }

  progressText(course: PlayerCourse | null): string {
    const total = this.flat(course).length;
    const done = this.completed.size;
    return `${done}/${total}`;
  }

  ringDash(percent: number, radius = 16): string {
    const circ = 2 * Math.PI * radius;
    const fill = (Math.min(100, Math.max(0, percent)) / 100) * circ;
    return `${fill.toFixed(2)} ${circ.toFixed(2)}`;
  }

  pickLesson(courseId: string, lessonId: string) {
    this.selectedLessonId = lessonId;
    this.bestEffortSetLastLesson(courseId, lessonId);

    const lesson = this.flatFromCurrentSelection(lessonId);
    if (lesson) {
      this.ensureFlashcardsLoaded(lesson);
      this.resetFlashcards(lesson.id);
    }

    if (this.isMobile) this.sidebarOpen = false;
  }

  // FIX 3: Capture the subscription reference before unsubscribing so that
  // if the observable hasn't emitted synchronously the unsubscribe still runs
  // correctly and doesn't leave a dangling subscriber.
  private flatFromCurrentSelection(lessonId: string): FlatLesson | null {
    let found: FlatLesson | null = null;
    const sub = this.state$.subscribe((st) => {
      if (st.data && !found) {
        found = this.flat(st.data).find((l) => l.id === lessonId) ?? null;
      }
    });
    sub.unsubscribe();
    return found;
  }

  prev(course: PlayerCourse) {
    const all = this.flat(course);
    const i = this.currentIndex(course);
    if (i <= 0) return;
    this.pickLesson(course.id, all[i - 1].id);
  }

  next(course: PlayerCourse) {
    const all = this.flat(course);
    const i = this.currentIndex(course);
    if (i >= all.length - 1) return;
    this.pickLesson(course.id, all[i + 1].id);
  }

  private bestEffortSetLastLesson(courseId: string, lessonId: string) {
    this.student.setLastLesson(courseId, lessonId).subscribe({ next: () => {}, error: () => {} });
  }

  private saveQuizIfNeeded(course: PlayerCourse, lessonId: string): Observable<unknown> {
    const lesson = this.flat(course).find((l) => l.id === lessonId);
    const isQuizLesson = !!lesson && this.isQuiz(lesson.type);

    if (!isQuizLesson) return of(null);
    if (!this.qp) return of(null);

    return this.qp.submitForCompletion({ showToastOnSuccess: false }).pipe(
      catchError((err) => {
        const msg =
          (typeof err?.error === 'string' && err.error) ||
          (typeof err?.message === 'string' && err.message) ||
          '';

        const low = msg.toLowerCase();
        const ignorable =
          low.includes('already submitted') ||
          low.includes('read only') ||
          low.includes('readonly') ||
          low.includes('submitted');

        if (ignorable) return of(null);
        return throwError(() => err);
      })
    );
  }

  markComplete(course: PlayerCourse, lessonId: string) {
    if (this.completing) return;
    this.completing = true;

    this.saveQuizIfNeeded(course, lessonId)
      .pipe(
        switchMap(() => this.student.completeLesson(lessonId)),
        finalize(() => (this.completing = false))
      )
      .subscribe({
        next: () => {
          this.completed.add(lessonId);
          this.toast.success('Lesson marked complete.');
        },
        error: (err) => {
          const msg = typeof err?.error === 'string' ? err.error : 'Failed to mark complete.';
          this.toast.error(msg);
        },
      });
  }

  markCompleteAndNext(course: PlayerCourse, lessonId: string) {
    if (this.completing) return;
    this.completing = true;

    this.saveQuizIfNeeded(course, lessonId)
      .pipe(
        switchMap(() => this.student.completeLesson(lessonId)),
        finalize(() => (this.completing = false))
      )
      .subscribe({
        next: () => {
          this.completed.add(lessonId);
          this.toast.success('Lesson complete.');
          if (this.hasNext(course)) this.next(course);
        },
        error: (err) => {
          const msg = typeof err?.error === 'string' ? err.error : 'Failed to mark complete.';
          this.toast.error(msg);
        },
      });
  }

  shouldShowFlashcards(lesson: FlatLesson | null): boolean {
    if (!lesson) return false;
    return this.isVideo(lesson.type) || this.isDoc(lesson.type) || this.isText(lesson.type);
  }

  ensureFlashcardsLoaded(lesson: FlatLesson | null) {
    if (!lesson) return;
    if (!this.shouldShowFlashcards(lesson)) return;
    if (this.flashcardsByLesson.has(lesson.id)) return;
    if (this.flashcardsLoading.has(lesson.id)) return;

    this.flashcardsLoading.add(lesson.id);

    this.student.getLessonFlashcards(lesson.id).subscribe({
      next: (items) => {
        this.flashcardsLoading.delete(lesson.id);
        this.flashcardsByLesson.set(
          lesson.id,
          (items ?? []).sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
        );
      },
      error: () => {
        this.flashcardsLoading.delete(lesson.id);
        this.flashcardsByLesson.set(lesson.id, []);
      },
    });
  }

  publishedFlashcardsFor(lessonId: string): FlashcardDto[] {
    return this.flashcardsByLesson.get(lessonId) ?? [];
  }

  toggleFlashcard(lessonId: string, index: number) {
    const current = this.flashcardFlips.get(lessonId) ?? new Set<number>();
    if (current.has(index)) current.delete(index);
    else current.add(index);
    this.flashcardFlips.set(lessonId, current);
  }

  isFlashcardFlipped(lessonId: string, index: number): boolean {
    return this.flashcardFlips.get(lessonId)?.has(index) ?? false;
  }

  resetFlashcards(lessonId: string) {
    this.flashcardFlips.set(lessonId, new Set<number>());
  }

  private normalizeHex(color?: string | null): string | null {
    if (!color) return null;
    const value = color.trim();

    if (/^#([0-9a-fA-F]{6})$/.test(value)) return value;

    if (/^#([0-9a-fA-F]{3})$/.test(value)) {
      const m = value.slice(1);
      return `#${m[0]}${m[0]}${m[1]}${m[1]}${m[2]}${m[2]}`;
    }

    return null;
  }

  private hexToRgba(hex: string, alpha: number): string {
    const normalized = this.normalizeHex(hex) || '#1a56db';
    const raw = normalized.replace('#', '');
    const r = parseInt(raw.slice(0, 2), 16);
    const g = parseInt(raw.slice(2, 4), 16);
    const b = parseInt(raw.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  private mixHex(hexA: string, hexB: string, weightB: number): string {
    const a = (this.normalizeHex(hexA) || '#1a56db').replace('#', '');
    const b = (this.normalizeHex(hexB) || '#ffffff').replace('#', '');

    const ar = parseInt(a.slice(0, 2), 16);
    const ag = parseInt(a.slice(2, 4), 16);
    const ab = parseInt(a.slice(4, 6), 16);

    const br = parseInt(b.slice(0, 2), 16);
    const bg = parseInt(b.slice(2, 4), 16);
    const bb = parseInt(b.slice(4, 6), 16);

    const mix = (x: number, y: number) => Math.round(x * (1 - weightB) + y * weightB);

    return `#${[mix(ar, br), mix(ag, bg), mix(ab, bb)]
      .map((n) => n.toString(16).padStart(2, '0'))
      .join('')}`;
  }
}