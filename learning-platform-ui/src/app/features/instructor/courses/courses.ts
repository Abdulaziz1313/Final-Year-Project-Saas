import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { BehaviorSubject, Observable, of, combineLatest, Subject } from 'rxjs';
import {
  catchError,
  map,
  shareReplay,
  startWith,
  switchMap,
  debounceTime,
  distinctUntilChanged
} from 'rxjs/operators';
import { FormBuilder, ReactiveFormsModule, FormGroup, FormControl } from '@angular/forms';

import { InstructorApi, CourseDto } from '../../../core/services/instructor-api';
import { ToastService } from '../../../shared/ui/toast.service';
import { environment } from '../../../../environments/environment'; // ✅ FIX

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

  // Academy header state
  academyState$: Observable<LoadState<AcademyInfo | null>>;

  // Courses list state
  state$: Observable<LoadState<CourseDto[]>>;

  filters: FormGroup<CourseFilters>;
  filtered$: Observable<LoadState<CourseDto[]>>;

  busyIds = new Set<string>(); // status updates / delete

  apiBase = environment.apiBaseUrl;

  img(url?: string | null) {
    if (!url) return null;
    return url.startsWith('http') ? url : this.apiBase + url;
  }

  constructor(
    private route: ActivatedRoute,
    private api: InstructorApi,
    private fb: FormBuilder,
    private toast: ToastService
  ) {
    this.academyId = this.route.snapshot.paramMap.get('academyId') || '';

    this.filters = this.fb.group<CourseFilters>({
      q: this.fb.control('', { nonNullable: true }),
      status: this.fb.control('all', { nonNullable: true }),
      category: this.fb.control('', { nonNullable: true }),
    });

    // Load academy info
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

    // Load courses
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

    // Debounce typing inputs
    this.qInput$.pipe(debounceTime(300), distinctUntilChanged()).subscribe(v => {
      this.filters.controls.q.setValue(v, { emitEvent: true });
    });

    this.catInput$.pipe(debounceTime(300), distinctUntilChanged()).subscribe(v => {
      this.filters.controls.category.setValue(v, { emitEvent: true });
    });

    // Filter client-side
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

  reload() {
    this.reload$.next();
  }

  onQInput(v: string) {
    this.qInput$.next(v);
  }

  onCategoryInput(v: string) {
    this.catInput$.next(v);
  }

  clearFilters() {
    this.filters.setValue({ q: '', status: 'all', category: '' }, { emitEvent: true });
  }

  statusLabel(status: number) {
    return status === 1 ? 'Published' : status === 2 ? 'Private' : 'Draft';
  }

  isBusy(id: string) {
    return this.busyIds.has(id);
  }

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

  delete(courseId: string) {
    if (!confirm('Delete this course permanently? This cannot be undone.')) return;

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

  // --- public links ---
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
