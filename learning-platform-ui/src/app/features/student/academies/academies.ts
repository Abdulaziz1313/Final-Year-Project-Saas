import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map, shareReplay, startWith, switchMap } from 'rxjs/operators';
import { StudentApi, PublicAcademy } from '../../../core/services/student-api';
import { environment } from '../../../../environments/environment';

type LoadState<T> = { loading: boolean; data: T; error: string | null };

@Component({
  selector: 'app-academies',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './academies.html',
  styleUrl: './academies.scss',
})
export class AcademiesComponent {
  api = environment.apiBaseUrl;

  q = '';
  sort = 'newest';

  private reload$ = new BehaviorSubject<void>(undefined);
  state$: Observable<LoadState<PublicAcademy[]>>;

  constructor(private student: StudentApi) {
    this.state$ = this.reload$.pipe(
      switchMap(() =>
        this.student.listAcademies(this.q, this.sort).pipe(
          map((res) => ({ loading: false, data: res ?? [], error: null } as LoadState<PublicAcademy[]>)),
          startWith({ loading: true, data: [], error: null } as LoadState<PublicAcademy[]>),
          catchError((err) =>
            of({
              loading: false,
              data: [],
              error: `Failed to load academies: ${err?.status ?? ''} ${err?.statusText ?? ''}`.trim(),
            } as LoadState<PublicAcademy[]>)
          )
        )
      ),
      shareReplay(1)
    );
  }

  search() { this.reload$.next(); }

  reset() {
    this.q = '';
    this.sort = 'newest';
    this.search();
  }

  onEnter(ev: KeyboardEvent) {
    if (ev.key === 'Enter') this.search();
  }

  img(url?: string | null) {
    if (!url) return null;
    return `${this.api}${url}`;
  }

  brand(a: PublicAcademy) {
    return a.primaryColor || '#7c3aed';
  }

  isNew(a: PublicAcademy) {
    // "new" if published within last 14 days (if publishedAt exists)
    if (!a.publishedAt) return false;
    const d = new Date(a.publishedAt).getTime();
    if (!Number.isFinite(d)) return false;
    const now = Date.now();
    const days = (now - d) / (1000 * 60 * 60 * 24);
    return days <= 14;
  }

  skeleton = Array.from({ length: 9 });
}
