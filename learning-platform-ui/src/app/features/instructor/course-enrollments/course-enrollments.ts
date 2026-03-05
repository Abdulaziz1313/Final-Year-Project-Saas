import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map, shareReplay, startWith, switchMap } from 'rxjs/operators';
import { InstructorApi } from '../../../core/services/instructor-api';
import { environment } from '../../../../environments/environment';

type LoadState<T> = { loading: boolean; data: T | null; error: string | null };

type SortBy = 'recent' | 'oldest' | 'progressDesc' | 'progressAsc' | 'nameAsc';
type FilterBy = 'all' | 'started' | 'notStarted' | 'completed';

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

  // UI state
  query = '';
  sortBy: SortBy = 'recent';
  filterBy: FilterBy = 'all';

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
              error:
                typeof err?.error === 'string'
                  ? err.error
                  : `Failed: ${err?.status ?? ''} ${err?.statusText ?? ''}`.trim(),
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

  avatar(url?: string | null) {
    if (!url) return null;
    return `${this.api}${url}`;
  }

  // ---------- UI helpers ----------
  setQuery(v: string) {
    this.query = (v ?? '').toString();
  }

  setSort(v: SortBy) {
    this.sortBy = v;
  }

  setFilter(v: FilterBy) {
    this.filterBy = v;
  }

  resetFilters() {
    this.query = '';
    this.sortBy = 'recent';
    this.filterBy = 'all';
  }

  initial(text: string) {
    const t = (text || 'S').trim();
    return t.slice(0, 1).toUpperCase();
  }

  clampPercent(p: any): number {
    const n = Number(p ?? 0);
    if (Number.isNaN(n)) return 0;
    return Math.max(0, Math.min(100, n));
  }

  avgPercent(students: any[]): number {
    const arr = students || [];
    if (!arr.length) return 0;
    const sum = arr.reduce((acc, s) => acc + this.clampPercent(s?.progress?.percent), 0);
    return Math.round(sum / arr.length);
  }

  timeAgo(dateStr?: string | null): string {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';

    const diffMs = Date.now() - d.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo ago`;
    const years = Math.floor(months / 12);
    return `${years}y ago`;
  }

  async copyEmail(email?: string | null) {
    if (!email) return;
    try {
      await navigator.clipboard.writeText(email);
    } catch {
      // ignore
    }
  }

  // ---------- Filtering + sorting ----------
  filteredStudents(students: any[]): any[] {
    const list = Array.isArray(students) ? [...students] : [];

    const q = this.query.trim().toLowerCase();
    let out = list.filter((s) => {
      const name = (s?.student?.displayName || '').toLowerCase();
      const email = (s?.student?.email || '').toLowerCase();
      const id = (s?.student?.id || '').toLowerCase();
      const match = !q || name.includes(q) || email.includes(q) || id.includes(q);

      const p = this.clampPercent(s?.progress?.percent);

      const filterOk =
        this.filterBy === 'all' ||
        (this.filterBy === 'started' && p > 0) ||
        (this.filterBy === 'notStarted' && p === 0) ||
        (this.filterBy === 'completed' && p === 100);

      return match && filterOk;
    });

    out.sort((a, b) => {
      const ap = this.clampPercent(a?.progress?.percent);
      const bp = this.clampPercent(b?.progress?.percent);

      const ad = new Date(a?.enrolledAt || 0).getTime();
      const bd = new Date(b?.enrolledAt || 0).getTime();

      const an = (a?.student?.displayName || a?.student?.email || a?.student?.id || '').toString().toLowerCase();
      const bn = (b?.student?.displayName || b?.student?.email || b?.student?.id || '').toString().toLowerCase();

      switch (this.sortBy) {
        case 'oldest':
          return ad - bd;
        case 'progressDesc':
          return bp - ap || bd - ad;
        case 'progressAsc':
          return ap - bp || bd - ad;
        case 'nameAsc':
          return an.localeCompare(bn);
        case 'recent':
        default:
          return bd - ad;
      }
    });

    return out;
  }
}
