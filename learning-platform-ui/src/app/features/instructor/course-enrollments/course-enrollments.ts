import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map, shareReplay, startWith, switchMap } from 'rxjs/operators';
import { InstructorApi } from '../../../core/services/instructor-api';
import { environment } from '../../../../environments/environment';

type LoadState<T> = { loading: boolean; data: T | null; error: string | null };

@Component({
  selector: 'app-course-enrollments',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './course-enrollments.html',
  styleUrl: './course-enrollments.scss',
})
export class CourseEnrollmentsComponent {
  api = environment.apiBaseUrl;
  courseId = '';

  private reload$ = new BehaviorSubject<void>(undefined);
  state$: Observable<LoadState<any>>;

  constructor(private route: ActivatedRoute, private apiSvc: InstructorApi) {
    this.courseId = this.route.snapshot.paramMap.get('courseId') || '';

    this.state$ = this.reload$.pipe(
      switchMap(() =>
        this.apiSvc.getCourseEnrollments(this.courseId).pipe(
          map((res) => ({ loading: false, data: res, error: null } as LoadState<any>)),
          startWith({ loading: true, data: null, error: null } as LoadState<any>),
          catchError((err) =>
            of({
              loading: false,
              data: null,
              error: `Failed: ${err?.status ?? ''} ${err?.statusText ?? ''}`.trim(),
            } as LoadState<any>)
          )
        )
      ),
      shareReplay(1)
    );
  }

  reload() { this.reload$.next(); }

  avatar(url?: string | null) {
    if (!url) return null;
    return `${this.api}${url}`;
  }
}
