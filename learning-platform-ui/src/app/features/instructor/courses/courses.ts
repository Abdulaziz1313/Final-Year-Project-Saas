import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { BehaviorSubject, Observable, of, combineLatest, Subject, firstValueFrom } from 'rxjs';
import {
  catchError,
  map,
  shareReplay,
  startWith,
  switchMap,
  debounceTime,
  distinctUntilChanged,
  take,
} from 'rxjs/operators';
import { FormBuilder, ReactiveFormsModule, FormGroup, FormControl } from '@angular/forms';

import { InstructorApi, CourseDto } from '../../../core/services/instructor-api';
import { ToastService } from '../../../shared/ui/toast.service';
import { ConfirmService } from '../../../shared/ui/confirm.service';
import { environment } from '../../../../environments/environment';

type LoadState<T> = { loading: boolean; data: T; error: string | null };

type CourseFilters = {
  q: FormControl<string>;
  status: FormControl<string>;
  category: FormControl<string>;
};

type AcademyInfo = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  primaryColor?: string | null;
  isPublished?: boolean;
  publishedAt?: string | null;
};

type EditCourseForm = {
  title: FormControl<string>;
  category: FormControl<string>;
  shortDescription: FormControl<string>;
  fullDescription: FormControl<string>;
  isFree: FormControl<boolean>;
  price: FormControl<string>;
  currency: FormControl<string>;
  tagsJson: FormControl<string>;
};

@Component({
  selector: 'app-instructor-courses',
  standalone: true,
  imports: [CommonModule, RouterModule, ReactiveFormsModule],
  templateUrl: './courses.html',
  styleUrl: './courses.scss',
})
export class CoursesComponent {
  academyId = '';

  private reload$ = new BehaviorSubject<void>(undefined);
  private qInput$ = new Subject<string>();
  private catInput$ = new Subject<string>();

  academyState$: Observable<LoadState<AcademyInfo | null>>;
  state$: Observable<LoadState<CourseDto[]>>;

  filters: FormGroup<CourseFilters>;
  filtered$: Observable<LoadState<CourseDto[]>>;

  busyIds = new Set<string>();
  apiBase = environment.apiBaseUrl;

  // Edit drawer state
  editOpen = false;
  editSaving = false;
  editingCourse: CourseDto | null = null;
  editForm: FormGroup<EditCourseForm>;

  // Thumbnail (course logo) edit state
  thumbBusy = false;
  currentThumbUrl: string | null = null;     // current url from API
  thumbPreviewUrl: string | null = null;     // local objectURL
  thumbFile: File | null = null;             // selected file
  thumbRemove = false;                       // user clicked remove

  img(url?: string | null) {
  if (!url) return null;
  if (url.startsWith('blob:') || url.startsWith('data:')) return url;
  if (url.startsWith('http')) return url;
  return this.apiBase + url;
}

  constructor(
    private route: ActivatedRoute,
    private api: InstructorApi,
    private fb: FormBuilder,
    private toast: ToastService,
    private confirm: ConfirmService,
  ) {
    this.academyId = this.route.snapshot.paramMap.get('academyId') || '';

    this.filters = this.fb.group<CourseFilters>({
      q: this.fb.control('', { nonNullable: true }),
      status: this.fb.control('all', { nonNullable: true }),
      category: this.fb.control('', { nonNullable: true }),
    });

    this.editForm = this.fb.group<EditCourseForm>({
      title: this.fb.control('', { nonNullable: true }),
      category: this.fb.control('', { nonNullable: true }),
      shortDescription: this.fb.control('', { nonNullable: true }),
      fullDescription: this.fb.control('', { nonNullable: true }),
      isFree: this.fb.control(true, { nonNullable: true }),
      price: this.fb.control('', { nonNullable: true }),
      currency: this.fb.control('EUR', { nonNullable: true }),
      tagsJson: this.fb.control('[]', { nonNullable: true }),
    });

    this.academyState$ = this.reload$.pipe(
      switchMap(() =>
        this.api.getAcademy(this.academyId).pipe(
          map((res) => ({ loading: false, data: (res ?? null) as AcademyInfo | null, error: null } as LoadState<AcademyInfo | null>)),
          startWith({ loading: true, data: null, error: null } as LoadState<AcademyInfo | null>),
          catchError((err) =>
            of({
              loading: false,
              data: null,
              error: `Failed to load academy: ${err?.status ?? ''} ${err?.statusText ?? ''}`.trim(),
            } as LoadState<AcademyInfo | null>)
          )
        )
      ),
      shareReplay(1)
    );

    this.state$ = this.reload$.pipe(
      switchMap(() =>
        this.api.listCourses(this.academyId).pipe(
          map((res) => ({ loading: false, data: res ?? [], error: null } as LoadState<CourseDto[]>)),
          startWith({ loading: true, data: [], error: null } as LoadState<CourseDto[]>),
          catchError((err) =>
            of({
              loading: false,
              data: [],
              error: `Failed to load courses: ${err?.status ?? ''} ${err?.statusText ?? ''}`.trim(),
            } as LoadState<CourseDto[]>)
          )
        )
      ),
      shareReplay(1)
    );

    this.qInput$.pipe(debounceTime(300), distinctUntilChanged()).subscribe(v => {
      this.filters.controls.q.setValue(v, { emitEvent: true });
    });

    this.catInput$.pipe(debounceTime(300), distinctUntilChanged()).subscribe(v => {
      this.filters.controls.category.setValue(v, { emitEvent: true });
    });

    this.filtered$ = combineLatest([
      this.state$,
      this.filters.valueChanges.pipe(startWith(this.filters.getRawValue()))
    ]).pipe(
      map(([st, fv]) => {
        if (st.loading || st.error) return st;

        const q = (fv.q || '').trim().toLowerCase();
        const status = fv.status || 'all';
        const category = (fv.category || '').trim().toLowerCase();

        let data = st.data;

        if (q) data = data.filter(c => (c.title || '').toLowerCase().includes(q));

        if (status !== 'all') {
          const wanted = status === 'published' ? 1 : status === 'private' ? 2 : 0;
          data = data.filter(c => c.status === wanted);
        }

        if (category) data = data.filter(c => (c.category || '').toLowerCase().includes(category));

        return { ...st, data };
      }),
      shareReplay(1)
    );
  }

  reload() { this.reload$.next(); }
  onQInput(v: string) { this.qInput$.next(v); }
  onCategoryInput(v: string) { this.catInput$.next(v); }

  clearFilters() {
    this.filters.setValue({ q: '', status: 'all', category: '' }, { emitEvent: true });
  }

  statusLabel(status: number) {
    return status === 1 ? 'Published' : status === 2 ? 'Private' : 'Draft';
  }

  isBusy(id: string) { return this.busyIds.has(id); }

  setStatus(courseId: string, value: string) {
    const status = Number(value);
    this.busyIds.add(courseId);

    this.api.updateCourseStatus(courseId, status).subscribe({
      next: () => {
        this.busyIds.delete(courseId);
        this.toast.success('Status updated.');
        this.reload();
      },
      error: (err) => {
        this.busyIds.delete(courseId);
        this.toast.error(`Update status failed: ${err?.status} ${err?.statusText}`);
      }
    });
  }

  quickSet(courseId: string, status: number) {
    this.setStatus(courseId, String(status));
  }

  async confirmDelete(courseId: string): Promise<void> {
    const st = await firstValueFrom(this.filtered$.pipe(take(1)));
    const title = st?.data?.find(c => c.id === courseId)?.title ?? 'this course';

    const confirmed = await this.confirm.ask({
      title: 'Delete course',
      message: `"${title}" will be permanently deleted and cannot be recovered. All enrollments and content will be lost.`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
    });

    if (confirmed) this.performDelete(courseId);
  }

  private performDelete(courseId: string): void {
    this.busyIds.add(courseId);

    this.api.deleteCourse(courseId).subscribe({
      next: () => {
        this.busyIds.delete(courseId);
        this.toast.success('Course deleted.');
        this.reload();
      },
      error: (err) => {
        this.busyIds.delete(courseId);
        this.toast.error(`Delete failed: ${err?.status} ${err?.statusText}`);
      }
    });
  }

  // ---------------- Edit Course Drawer ----------------

  openEditDrawer(c: CourseDto) {
    if (!c?.id) return;

    this.editingCourse = c;
    this.editOpen = true;
    this.editSaving = false;

    // reset thumb state (important)
    this.resetThumbState();
    this.currentThumbUrl = c.thumbnailUrl ?? null;

    this.api.getCourse(c.id).subscribe({
      next: (full: any) => {
        const isFree = !!full?.isFree;
        const price = full?.price != null ? String(full.price) : '';
        const currency = (full?.currency || 'EUR').toString();

        this.editForm.reset(
          {
            title: (full?.title || c.title || '').toString(),
            category: (full?.category || c.category || '').toString(),
            shortDescription: (full?.shortDescription || '').toString(),
            fullDescription: (full?.fullDescription || '').toString(),
            isFree,
            price,
            currency,
            tagsJson: (full?.tagsJson || '[]').toString(),
          },
          { emitEvent: false }
        );

        this.toggleFree(isFree, false);

        // if full returns thumbnailUrl, use it
        this.currentThumbUrl = full?.thumbnailUrl ?? this.currentThumbUrl;
      },
      error: (err) => {
        this.toast.error(`Failed to load course: ${err?.status} ${err?.statusText}`);
        this.editForm.reset(
          {
            title: (c.title || '').toString(),
            category: (c.category || '').toString(),
            shortDescription: '',
            fullDescription: '',
            isFree: !!c.isFree,
            price: c.price != null ? String(c.price) : '',
            currency: (c.currency || 'EUR').toString(),
            tagsJson: '[]',
          },
          { emitEvent: false }
        );
        this.toggleFree(!!c.isFree, false);
      },
    });
  }

  closeEditDrawer() {
    this.editOpen = false;
    this.editSaving = false;
    this.editingCourse = null;
    this.resetThumbState(true);
  }

  toggleFree(isFree: boolean, emit = true) {
    this.editForm.controls.isFree.setValue(isFree, { emitEvent: emit });
    if (isFree) {
      this.editForm.controls.price.disable({ emitEvent: false });
      this.editForm.controls.price.setValue('', { emitEvent: false });
    } else {
      this.editForm.controls.price.enable({ emitEvent: false });
    }
  }

  // Thumbnail helpers
  private resetThumbState(revokePreview = false) {
    if (revokePreview && this.thumbPreviewUrl) {
      try { URL.revokeObjectURL(this.thumbPreviewUrl); } catch {}
    }
    this.thumbBusy = false;
    this.thumbFile = null;
    this.thumbRemove = false;
    this.thumbPreviewUrl = null;
    // don't clear currentThumbUrl here unless you want to
  }

  onThumbSelected(file: File | null) {
    if (!file) return;

    // validate
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      this.toast.error('Only JPG, PNG, or WEBP allowed.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.toast.error('Max thumbnail size is 5MB.');
      return;
    }

    // new selection cancels "remove"
    this.thumbRemove = false;

    // revoke old preview
    if (this.thumbPreviewUrl) {
      try { URL.revokeObjectURL(this.thumbPreviewUrl); } catch {}
    }

    this.thumbFile = file;
    this.thumbPreviewUrl = URL.createObjectURL(file);
  }

  markThumbRemoved() {
    // user wants to remove current thumbnail
    this.thumbRemove = true;
    this.thumbFile = null;

    if (this.thumbPreviewUrl) {
      try { URL.revokeObjectURL(this.thumbPreviewUrl); } catch {}
      this.thumbPreviewUrl = null;
    }
  }

  thumbShownUrl(): string | null {
    // priority: local preview > current server url (unless removed)
    if (this.thumbRemove) return null;
    return this.thumbPreviewUrl || this.currentThumbUrl || null;
  }

  async saveEdit() {
    const c = this.editingCourse;
    if (!c?.id || this.editSaving) return;

    const v = this.editForm.getRawValue();
    const title = (v.title || '').trim();
    const category = (v.category || '').trim();
    const shortDescription = (v.shortDescription || '').trim();
    const fullDescription = (v.fullDescription || '').trim();
    const isFree = !!v.isFree;

    const currency = (v.currency || 'EUR').trim().toUpperCase();
    const tagsJson = (v.tagsJson || '[]').trim();

    let priceNum: number | null = null;
    if (!isFree) {
      const raw = (v.price || '').trim();
      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        this.toast.error('Paid courses must have a price > 0.');
        return;
      }
      priceNum = parsed;
    }

    if (!title) {
      this.toast.error('Title is required.');
      return;
    }

    try {
      const parsed = JSON.parse(tagsJson || '[]');
      if (!Array.isArray(parsed)) {
        this.toast.error('TagsJson must be a JSON array (e.g. ["web","angular"]).');
        return;
      }
    } catch {
      this.toast.error('TagsJson must be valid JSON (e.g. ["web","angular"]).');
      return;
    }

    this.editSaving = true;
    this.busyIds.add(c.id);

    try {
      // 1) save metadata
      await firstValueFrom(this.api.updateCourse(c.id, {
        title,
        category: category || null,
        shortDescription: shortDescription || null,
        fullDescription: fullDescription || null,
        isFree,
        price: isFree ? null : priceNum,
        currency,
        tagsJson,
      }));

      // 2) apply thumbnail changes (remove OR upload)
      if (this.thumbRemove) {
        this.thumbBusy = true;
        await firstValueFrom(this.api.deleteCourseThumbnail(c.id));
        this.currentThumbUrl = null;
        this.thumbBusy = false;
      } else if (this.thumbFile) {
        this.thumbBusy = true;
        const res = await firstValueFrom(this.api.uploadCourseThumbnail(c.id, this.thumbFile));
        this.currentThumbUrl = res?.thumbnailUrl ?? null;
        this.thumbBusy = false;
      }

      this.toast.success('Course updated.');
      this.closeEditDrawer();
      this.reload();
    } catch (err: any) {
      const msg =
        err?.error?.message ||
        (typeof err?.error === 'string' ? err.error : null) ||
        `Update failed: ${err?.status ?? ''} ${err?.statusText ?? ''}`.trim();
      this.toast.error(msg);
    } finally {
      this.busyIds.delete(c.id);
      this.editSaving = false;
      this.thumbBusy = false;
    }
  }

  publicCourseLink(courseId: string) {
    return `${window.location.origin}/#/course/${courseId}`;
  }

  publicAcademyLink(slug: string) {
    return `${window.location.origin}/#/academy/${slug}`;
  }

  async copyCourseLink(courseId: string) {
    try {
      await navigator.clipboard.writeText(this.publicCourseLink(courseId));
      this.toast.success('Public course link copied.');
    } catch {
      this.toast.error('Copy failed.');
    }
  }

  async copyAcademyLink(slug: string) {
    try {
      await navigator.clipboard.writeText(this.publicAcademyLink(slug));
      this.toast.success('Public academy link copied.');
    } catch {
      this.toast.error('Copy failed.');
    }
  }
}