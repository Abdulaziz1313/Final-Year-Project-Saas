import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map, shareReplay, startWith, switchMap } from 'rxjs/operators';
import { InstructorApi, AcademyDto } from '../../../core/services/instructor-api';

type LoadState<T> = { loading: boolean; data: T | null; error: string | null };

@Component({
  selector: 'app-instructor-academies-manage',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './academies-manage.html',
  styleUrl: './academies-manage.scss',
})
export class InstructorAcademiesManageComponent {
  private reload$ = new BehaviorSubject<void>(undefined);
  state$: Observable<LoadState<AcademyDto[]>>;

  constructor(private api: InstructorApi) {
    this.state$ = this.reload$.pipe(
      switchMap(() =>
        this.api.getMyAcademies().pipe(
          map((items) => ({ loading: false, data: items ?? [], error: null } as LoadState<AcademyDto[]>)),
          startWith({ loading: true, data: null, error: null } as LoadState<AcademyDto[]>),
          catchError((err) =>
            of({
              loading: false, data: null,
              error: `Failed to load: ${err?.status ?? ''} ${err?.statusText ?? ''}`.trim(),
            } as LoadState<AcademyDto[]>)
          )
        )
      ),
      shareReplay(1)
    );
  }

  reload() { this.reload$.next(); }

  badgeLetter(name?: string | null): string {
    return ((name || 'A')[0] || 'A').toUpperCase();
  }
}