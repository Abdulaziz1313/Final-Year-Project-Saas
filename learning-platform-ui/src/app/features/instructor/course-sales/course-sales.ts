import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Observable, of } from 'rxjs';
import { catchError, map, startWith, switchMap } from 'rxjs/operators';
import { CourseSalesResponse, InstructorApi } from '../../../core/services/instructor-api';

type LoadState<T> = {
  loading: boolean;
  data: T | null;
  error: string | null;
};

@Component({
  selector: 'app-course-sales',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './course-sales.html',
  styleUrl: './course-sales.scss',
})
export class CourseSalesComponent {
  courseId = '';
  statusFilter = '';
  page = 1;
  pageSize = 20;
  state$: Observable<LoadState<CourseSalesResponse>>;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private instructor: InstructorApi
  ) {
    this.courseId = this.route.snapshot.paramMap.get('courseId') || '';

    this.state$ = this.route.paramMap.pipe(
      map((params) => params.get('courseId') || ''),
      switchMap((courseId) => {
        this.courseId = courseId;

        if (!courseId) {
          return of({
            loading: false,
            data: null,
            error: 'Missing course ID.',
          } as LoadState<CourseSalesResponse>);
        }

        return this.instructor.getCourseSales(courseId, this.statusFilter, this.page, this.pageSize).pipe(
          map((data) => ({ loading: false, data, error: null } as LoadState<CourseSalesResponse>)),
          startWith({ loading: true, data: null, error: null } as LoadState<CourseSalesResponse>),
          catchError((err) =>
            of({
              loading: false,
              data: null,
              error: typeof err?.error === 'string' ? err.error : 'Failed to load course sales.',
            } as LoadState<CourseSalesResponse>)
          )
        );
      })
    );
  }

  reload() {
    const current = this.courseId;
    this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
      this.router.navigateByUrl(`/instructor/course-sales/${current}`);
    });
  }

  money(amount: number, currency = 'EUR'): string {
    return `${amount} ${currency}`;
  }

  when(value?: string | null): string {
    if (!value) return '—';
    const t = Date.parse(value);
    return Number.isFinite(t) ? new Date(t).toLocaleString() : value;
  }

  statusClass(status: string): string {
    return (status || '').toLowerCase();
  }
}