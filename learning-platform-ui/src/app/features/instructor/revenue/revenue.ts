import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Observable, of } from 'rxjs';
import { catchError, map, startWith, switchMap } from 'rxjs/operators';
import { InstructorApi, AcademyRevenueSummary } from '../../../core/services/instructor-api';

type LoadState<T> = {
  loading: boolean;
  data: T | null;
  error: string | null;
};

@Component({
  selector: 'app-revenue',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './revenue.html',
  styleUrl: './revenue.scss',
})
export class RevenueComponent {
  academyId = '';
  state$: Observable<LoadState<AcademyRevenueSummary>>;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private instructor: InstructorApi
  ) {
    this.academyId = this.route.snapshot.paramMap.get('academyId') || '';

    this.state$ = this.route.paramMap.pipe(
      map((params) => params.get('academyId') || ''),
      switchMap((academyId) => {
        this.academyId = academyId;

        if (!academyId) {
          return of({
            loading: false,
            data: null,
            error: 'Missing academy ID.',
          } as LoadState<AcademyRevenueSummary>);
        }

        return this.instructor.getAcademyRevenueSummary(academyId).pipe(
          map((data) => ({ loading: false, data, error: null } as LoadState<AcademyRevenueSummary>)),
          startWith({ loading: true, data: null, error: null } as LoadState<AcademyRevenueSummary>),
          catchError((err) =>
            of({
              loading: false,
              data: null,
              error: typeof err?.error === 'string' ? err.error : 'Failed to load revenue analytics.',
            } as LoadState<AcademyRevenueSummary>)
          )
        );
      })
    );
  }

  money(amount: number, currency = 'EUR'): string {
    return `${amount} ${currency}`;
  }

  openCourseSales(courseId: string) {
    this.router.navigateByUrl(`/instructor/course-sales/${courseId}`);
  }

  openAcademySales() {
    this.router.navigateByUrl(`/instructor/academy-sales/${this.academyId}`);
  }

  trackMax(points: { revenue: number }[]): number {
    return Math.max(...points.map((x) => x.revenue), 1);
  }

  trackHeight(value: number, max: number): number {
    if (max <= 0) return 8;
    return Math.max(8, Math.round((value / max) * 180));
  }

  shortDate(value: string): string {
    const t = Date.parse(value);
    return Number.isFinite(t) ? new Date(t).toLocaleDateString() : value;
  }
}
