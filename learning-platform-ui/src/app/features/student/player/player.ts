import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map, shareReplay, startWith, switchMap, tap } from 'rxjs/operators';
import { StudentApi, PlayerCourse } from '../../../core/services/student-api';
import { ToastService } from '../../../shared/ui/toast.service';
import { environment } from '../../../../environments/environment';

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
  imports: [CommonModule, RouterModule],
  templateUrl: './player.html',
  styleUrl: './player.scss',
})
export class PlayerComponent {
  courseId = '';
  private reload$ = new BehaviorSubject<void>(undefined);
  state$: Observable<LoadState<PlayerCourse>>;

  selectedLessonId: string | null = null;
  completing = false;

  // ✅ now hydrated from server (CourseContent returns completedLessonIds)
  completed = new Set<string>();

  apiBase = environment.apiBaseUrl;

  constructor(
    private route: ActivatedRoute,
    private student: StudentApi,
    private toast: ToastService
  ) {
    this.courseId = this.route.snapshot.paramMap.get('courseId') || '';

    this.state$ = this.reload$.pipe(
      switchMap(() =>
        this.student.courseContent(this.courseId).pipe(
          tap((res) => {
            // ✅ Hydrate completed lessons from server
            const ids = (res as any)?.completedLessonIds as string[] | undefined;
            this.completed = new Set(ids ?? []);

            // Auto-select first lesson if neither selected nor lastLessonId exists
            if (!this.selectedLessonId) {
              const first = this.firstLessonId(res);
              if (!res.lastLessonId && first) {
                this.selectedLessonId = first;
                this.bestEffortSetLastLesson(res.id, first);
              }
            }
          }),
          map((res) => ({ loading: false, data: res, error: null } as LoadState<PlayerCourse>)),
          startWith({ loading: true, data: null, error: null } as LoadState<PlayerCourse>),
          catchError((err) =>
            of({
              loading: false,
              data: null,
              error: typeof err?.error === 'string'
                ? err.error
                : `Failed to load course: ${err?.status ?? ''} ${err?.statusText ?? ''}`.trim(),
            } as LoadState<PlayerCourse>)
          )
        )
      ),
      shareReplay(1)
    );
  }

  reload() { this.reload$.next(); }

  // ---------- Helpers ----------
  n(v: any): number { return Number(v); }

  assetUrl(url?: string | null): string | null {
    if (!url) return null;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return this.apiBase + url;
  }

  isVideo(type: any) { return this.n(type) === 0; }
  isDoc(type: any) { return this.n(type) === 1; }
  isText(type: any) { return this.n(type) === 2; }

  // Flatten lessons in order
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
          isPreviewFree: !!l.isPreviewFree,
          isDownloadable: !!(l as any).isDownloadable
        });
      }
    }
    return out;
  }

  firstLessonId(course: PlayerCourse | null): string | null {
    const all = this.flat(course);
    return all.length ? all[0].id : null;
  }

  // Current lesson id priority: selected → lastLessonId → first
  activeLessonId(course: PlayerCourse | null): string | null {
    const all = this.flat(course);
    if (!all.length) return null;

    const want = this.selectedLessonId || course?.lastLessonId || all[0].id;
    const exists = all.some(l => l.id === want);
    return exists ? want : all[0].id;
  }

  currentLesson(course: PlayerCourse | null): FlatLesson | null {
    const all = this.flat(course);
    if (!all.length) return null;
    const id = this.activeLessonId(course);
    return all.find(l => l.id === id) || all[0];
  }

  currentIndex(course: PlayerCourse | null): number {
    const all = this.flat(course);
    const id = this.activeLessonId(course);
    return Math.max(0, all.findIndex(l => l.id === id));
  }

  hasPrev(course: PlayerCourse | null): boolean {
    return this.currentIndex(course) > 0;
  }

  hasNext(course: PlayerCourse | null): boolean {
    const all = this.flat(course);
    return this.currentIndex(course) < all.length - 1;
  }

  // Progress summary (server hydrated)
  progressText(course: PlayerCourse | null): string {
    const total = this.flat(course).length;
    const done = this.completed.size;
    return `${done}/${total}`;
  }

  // ---------- Navigation ----------
  pickLesson(courseId: string, lessonId: string) {
    this.selectedLessonId = lessonId;
    this.bestEffortSetLastLesson(courseId, lessonId);
  }

  prev(course: PlayerCourse) {
    const all = this.flat(course);
    const i = this.currentIndex(course);
    if (i <= 0) return;
    const lessonId = all[i - 1].id;
    this.pickLesson(course.id, lessonId);
  }

  next(course: PlayerCourse) {
    const all = this.flat(course);
    const i = this.currentIndex(course);
    if (i >= all.length - 1) return;
    const lessonId = all[i + 1].id;
    this.pickLesson(course.id, lessonId);
  }

  private bestEffortSetLastLesson(courseId: string, lessonId: string) {
    this.student.setLastLesson(courseId, lessonId).subscribe({ next: () => {}, error: () => {} });
  }

  // ---------- Completion ----------
  markComplete(lessonId: string) {
    if (this.completing) return;
    this.completing = true;

    this.student.completeLesson(lessonId).subscribe({
      next: () => {
        this.completing = false;
        this.completed.add(lessonId);
        this.toast.success('Lesson marked complete.');
      },
      error: (err) => {
        this.completing = false;
        const msg = typeof err?.error === 'string' ? err.error : 'Failed to mark complete.';
        this.toast.error(msg);
      }
    });
  }

  markCompleteAndNext(course: PlayerCourse, lessonId: string) {
    if (this.completing) return;
    this.completing = true;

    this.student.completeLesson(lessonId).subscribe({
      next: () => {
        this.completed.add(lessonId);
        this.toast.success('Lesson complete.');

        if (this.hasNext(course)) {
          this.next(course);
        }

        this.completing = false;
      },
      error: (err) => {
        this.completing = false;
        const msg = typeof err?.error === 'string' ? err.error : 'Failed to mark complete.';
        this.toast.error(msg);
      }
    });
  }
}
