import { Component, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { catchError, finalize, map, shareReplay, startWith, switchMap, tap } from 'rxjs/operators';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';

import { StudentApi, PlayerCourse } from '../../../core/services/student-api';
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
  imports: [CommonModule, RouterModule, FormsModule, QuizPlayerComponent],
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

  // UI state
  lessonQuery = '';
  sidebarOpen = true;
  isMobile = false;

  private moduleOpen = new Map<string, boolean>();

  constructor(
    private route: ActivatedRoute,
    private student: StudentApi,
    private toast: ToastService,
    private sanitizer: DomSanitizer
  ) {
    this.courseId = this.route.snapshot.paramMap.get('courseId') || '';

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

            if (!this.selectedLessonId) {
              const first = this.firstLessonId(res);
              if (!res.lastLessonId && first) {
                this.selectedLessonId = first;
                this.bestEffortSetLastLesson(res.id, first);
              }
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
          moduleId: m.id,
          moduleTitle: m.title,
          id: l.id,
          title: l.title,
          type: this.n(l.type),
          contentUrl: (l as any).contentUrl ?? null,
          htmlContent: (l as any).htmlContent ?? null,
          isPreviewFree: !!(l as any).isPreviewFree,
          isDownloadable: !!(l as any).isDownloadable,
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

  /**
   * Returns a stroke-dasharray string for SVG circular progress rings.
   * Circumference = 2π × r
   *   r = 16 (default) → ~100.53  (my-learning card rings)
   *   r = 13            → ~81.68   (player topbar ring)
   */
  ringDash(percent: number, radius = 16): string {
    const circ = 2 * Math.PI * radius;
    const fill = (Math.min(100, Math.max(0, percent)) / 100) * circ;
    return `${fill.toFixed(2)} ${circ.toFixed(2)}`;
  }

  pickLesson(courseId: string, lessonId: string) {
    this.selectedLessonId = lessonId;
    this.bestEffortSetLastLesson(courseId, lessonId);

    if (this.isMobile) this.sidebarOpen = false;
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
}