import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map, shareReplay, startWith, switchMap } from 'rxjs/operators';

import { InstructorApi } from '../../../core/services/instructor-api';
import { ToastService } from '../../../shared/ui/toast.service';
import { environment } from '../../../../environments/environment';
import { ConfirmService } from '../../../shared/ui/confirm.service';

type LoadState<T> = { loading: boolean; data: T | null; error: string | null };

@Component({
  selector: 'app-course-builder',
  standalone: true,
  imports: [CommonModule, RouterModule, ReactiveFormsModule],
  templateUrl: './course-builder.html',
  styleUrl: './course-builder.scss',
})
export class CourseBuilderComponent {
  apiBase = environment.apiBaseUrl;
  courseId = '';

  private reload$ = new BehaviorSubject<void>(undefined);
  state$: Observable<LoadState<any>>;

  // forms
  moduleForm: any;
  private lessonForms = new Map<string, any>();

  // UI states
  collapsedModules = new Set<string>();
  uploadingVideoIds = new Set<string>();
  uploadingFileIds = new Set<string>();
  deletingLessonIds = new Set<string>();
  reordering = false;
  publishing = false;

  constructor(
    private route: ActivatedRoute,
    private api: InstructorApi,
    private fb: FormBuilder,
    private toast: ToastService,
    private confirm: ConfirmService
  ) {
    this.courseId = this.route.snapshot.paramMap.get('courseId') || '';

    this.moduleForm = this.fb.group({
      title: ['', [Validators.required, Validators.minLength(2)]],
    });

    this.state$ = this.reload$.pipe(
      switchMap(() =>
        this.api.getCourse(this.courseId).pipe(
          map((res: any) => ({ loading: false, data: res, error: null } as LoadState<any>)),
          startWith({ loading: true, data: null, error: null } as LoadState<any>),
          catchError((err) =>
            of({
              loading: false,
              data: null,
              error: typeof err?.error === 'string'
                ? err.error
                : `Failed to load course: ${err?.status ?? ''} ${err?.statusText ?? ''}`.trim(),
            } as LoadState<any>)
          )
        )
      ),
      shareReplay(1)
    );
  }

  reload() {
    this.reload$.next();
  }

  // ---------- Helpers ----------
  n(v: any): number {
    return Number(v);
  }

  statusLabel(status: any): string {
    const s = this.n(status);
    if (s === 1) return 'Published';
    if (s === 0) return 'Draft';
    return 'Unknown';
  }

  isPublished(status: any): boolean {
    return this.n(status) === 1;
  }

  publicCourseLink(): string {
    return `${window.location.origin}/#/course/${this.courseId}`;
  }

  async copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      this.toast.success('Link copied.');
    } catch {
      this.toast.error('Copy failed.');
    }
  }

  // ---------- Collapse ----------
  isCollapsed(moduleId: string): boolean {
    return this.collapsedModules.has(moduleId);
  }

  toggleModule(moduleId: string) {
    if (this.collapsedModules.has(moduleId)) this.collapsedModules.delete(moduleId);
    else this.collapsedModules.add(moduleId);
  }

  expandAll(mods: any[]) {
    this.collapsedModules.clear();
    this.toast.success('Expanded.');
  }

  collapseAll(mods: any[]) {
    this.collapsedModules = new Set((mods || []).map((m: any) => m.id));
    this.toast.success('Collapsed.');
  }

  // ---------- Lesson form ----------
  ensureLessonForm(moduleId: string) {
    const existing = this.lessonForms.get(moduleId);
    if (existing) return existing;

    const fg = this.fb.group({
      title: ['', [Validators.required, Validators.minLength(2)]],
      type: [2, [Validators.required]], // 2=Text by default
      htmlContent: [''],
      isPreviewFree: [false],
      isDownloadable: [false],
    });

    this.lessonForms.set(moduleId, fg);
    return fg;
  }

  // ---------- Add module ----------
  addModule() {
    if (this.moduleForm.invalid) {
      this.moduleForm.markAllAsTouched();
      return;
    }

    const title = this.moduleForm.value.title;

    this.api.addModule(this.courseId, { title }).subscribe({
      next: () => {
        this.toast.success('Module added');
        this.moduleForm.reset({ title: '' });
        this.reload();
      },
      error: (err) => {
        const msg = typeof err?.error === 'string' ? err.error : 'Add module failed';
        this.toast.error(msg);
      }
    });
  }

  // ---------- Add lesson ----------
  addLesson(moduleId: string) {
    const form = this.ensureLessonForm(moduleId);

    if (form.invalid) {
      form.markAllAsTouched();
      return;
    }

    const v = form.value;
    const typeNum = this.n(v.type);

    const payload = {
      title: v.title,
      type: typeNum,
      contentUrl: null,
      htmlContent: typeNum === 2 ? (v.htmlContent || '') : null,
      isPreviewFree: !!v.isPreviewFree,
      isDownloadable: !!v.isDownloadable
    };

    this.api.addLesson(moduleId, payload).subscribe({
      next: () => {
        this.toast.success('Lesson added');
        form.reset({ title: '', type: 2, htmlContent: '', isPreviewFree: false, isDownloadable: false });
        this.reload();
      },
      error: (err) => {
        const msg = typeof err?.error === 'string' ? err.error : 'Add lesson failed';
        this.toast.error(msg);
      }
    });
  }

  // ---------- Uploads ----------
  uploadVideo(lessonId: string, ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.uploadingVideoIds.add(lessonId);

    this.api.uploadLessonVideo(lessonId, file).subscribe({
      next: () => {
        this.uploadingVideoIds.delete(lessonId);
        this.toast.success('Video uploaded');
        input.value = '';
        this.reload();
      },
      error: (err) => {
        this.uploadingVideoIds.delete(lessonId);
        this.toast.error(typeof err?.error === 'string' ? err.error : 'Upload failed');
        input.value = '';
      }
    });
  }

  uploadFile(lessonId: string, ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.uploadingFileIds.add(lessonId);

    this.api.uploadLessonFile(lessonId, file).subscribe({
      next: () => {
        this.uploadingFileIds.delete(lessonId);
        this.toast.success('File uploaded');
        input.value = '';
        this.reload();
      },
      error: (err) => {
        this.uploadingFileIds.delete(lessonId);
        this.toast.error(typeof err?.error === 'string' ? err.error : 'Upload failed');
        input.value = '';
      }
    });
  }

  isUploading(lessonId: string): boolean {
    return this.uploadingVideoIds.has(lessonId) || this.uploadingFileIds.has(lessonId);
  }

  // ---------- Delete lesson ----------
  async deleteLesson(lessonId: string, title: string) {
    if (this.deletingLessonIds.has(lessonId)) return;

    const ok = await this.confirm.open({
      title: 'Delete lesson?',
      message: `Delete "${title}"? This will remove the lesson and any student progress for it.`,
      confirmText: 'Delete',
      cancelText: 'Cancel'
    });

    if (!ok) return;

    this.deletingLessonIds.add(lessonId);

    this.api.deleteLesson(lessonId).subscribe({
      next: () => {
        this.deletingLessonIds.delete(lessonId);
        this.toast.success('Lesson deleted.');
        this.reload();
      },
      error: (err) => {
        this.deletingLessonIds.delete(lessonId);
        const msg = typeof err?.error === 'string' ? err.error : 'Delete lesson failed.';
        this.toast.error(msg);
      }
    });
  }

  // ---------- Reorder modules ----------
  moveModule(mods: any[], index: number, dir: -1 | 1) {
    if (this.reordering) return;
    if (!mods || mods.length < 2) return;

    const target = index + dir;
    if (target < 0 || target >= mods.length) return;

    const ids = mods.map(m => m.id);
    // swap
    [ids[index], ids[target]] = [ids[target], ids[index]];

    this.reordering = true;
    this.api.reorderModules(this.courseId, ids).subscribe({
      next: () => {
        this.reordering = false;
        this.toast.success('Module order updated.');
        this.reload();
      },
      error: (err) => {
        this.reordering = false;
        const msg = typeof err?.error === 'string' ? err.error : 'Reorder failed.';
        this.toast.error(msg);
      }
    });
  }

  // ---------- Reorder lessons ----------
  moveLesson(moduleId: string, lessons: any[], index: number, dir: -1 | 1) {
    if (this.reordering) return;
    if (!lessons || lessons.length < 2) return;

    const target = index + dir;
    if (target < 0 || target >= lessons.length) return;

    const ids = lessons.map(l => l.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];

    this.reordering = true;
    this.api.reorderLessons(moduleId, ids).subscribe({
      next: () => {
        this.reordering = false;
        this.toast.success('Lesson order updated.');
        this.reload();
      },
      error: (err) => {
        this.reordering = false;
        const msg = typeof err?.error === 'string' ? err.error : 'Reorder failed.';
        this.toast.error(msg);
      }
    });
  }

  // ---------- Delete module ----------
  async deleteModule(moduleId: string, lessonCount: number) {
    if (lessonCount > 0) {
      this.toast.error('This module has lessons. Delete the lessons first.');
      return;
    }

    const ok = await this.confirm.open({
      title: 'Delete module?',
      message: 'This will delete the module. This action cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel'
    });

    if (!ok) return;

    this.api.deleteModule(moduleId).subscribe({
      next: () => {
        this.toast.success('Module deleted.');
        this.reload();
      },
      error: (err) => {
        const msg = typeof err?.error === 'string' ? err.error : 'Delete module failed.';
        this.toast.error(msg);
      }
    });
  }

  // ---------- Publish ----------
  publishCourse(courseId: string) {
    if (this.publishing) return;
    this.publishing = true;

    this.api.publishCourse(courseId).subscribe({
      next: () => {
        this.publishing = false;
        this.toast.success('Course published.');
        this.reload();
      },
      error: (err) => {
        this.publishing = false;
        this.toast.error(typeof err?.error === 'string' ? err.error : 'Publish failed.');
      }
    });
  }

  // ---------- Draft inputs ----------
  resetDrafts() {
    this.moduleForm.reset({ title: '' });
    this.lessonForms.clear();
    this.toast.info('Draft inputs cleared.');
  }
}
