import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { BehaviorSubject, Observable, Subject, of } from 'rxjs';
import { catchError, map, shareReplay, startWith, switchMap, takeUntil, debounceTime } from 'rxjs/operators';

import { StudentApi, PublicAcademy } from '../../../core/services/student-api';
import { environment } from '../../../../environments/environment';

type LoadState<T> = { loading: boolean; data: T; error: string | null };
type SortKey = 'newest' | 'name';

type Vm = {
  // raw
  items: PublicAcademy[];

  // featured
  newItems: PublicAcademy[];
  recentItems: PublicAcademy[];

  // main list
  filtered: PublicAcademy[];

  // counts
  total: number;
  showing: number;
};

@Component({
  selector: 'app-academies',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './academies.html',
  styleUrl: './academies.scss',
})
export class AcademiesComponent implements OnDestroy {
  api = environment.apiBaseUrl;

  q = '';
  sort: SortKey = 'newest';
  onlyNew = false;

  skeleton = Array.from({ length: 9 });

  private destroy$ = new Subject<void>();
  private reload$ = new BehaviorSubject<void>(undefined);
  private inputChanged$ = new Subject<void>();

  state$: Observable<LoadState<Vm>>;

  constructor(
    private student: StudentApi,
    private router: Router,
    private route: ActivatedRoute
  ) {
    // hydrate from URL
    this.route.queryParamMap.pipe(takeUntil(this.destroy$)).subscribe((pm) => {
      const q = (pm.get('q') ?? '').trim();
      const sort = (pm.get('sort') ?? 'newest') as SortKey;
      const onlyNew = (pm.get('new') ?? '0') === '1';

      this.q = q;
      this.sort = (sort === 'name' || sort === 'newest') ? sort : 'newest';
      this.onlyNew = onlyNew;

      this.reload$.next();
    });

    // debounce typing
    this.inputChanged$
      .pipe(debounceTime(350), takeUntil(this.destroy$))
      .subscribe(() => this.search());

    this.state$ = this.reload$.pipe(
      switchMap(() =>
        this.student.listAcademies(this.q, this.sort).pipe(
          map((res) => {
            const items = (res ?? []) as PublicAcademy[];

            // featured sections (based on publishedAt)
            const newItems = items
              .filter((a) => this.isNew(a))
              .slice(0, 10);

            const recentItems = this.sortByPublishedDesc(items)
              .slice(0, 10);

            // main list filter
            const filtered = this.onlyNew ? items.filter((a) => this.isNew(a)) : items;

            const vm: Vm = {
              items,
              newItems,
              recentItems,
              filtered,
              total: items.length,
              showing: filtered.length,
            };

            return { loading: false, data: vm, error: null } as LoadState<Vm>;
          }),
          startWith({
            loading: true,
            data: { items: [], newItems: [], recentItems: [], filtered: [], total: 0, showing: 0 },
            error: null,
          } as LoadState<Vm>),
          catchError((err) =>
            of({
              loading: false,
              data: { items: [], newItems: [], recentItems: [], filtered: [], total: 0, showing: 0 },
              error: `Failed to load academies: ${err?.status ?? ''} ${err?.statusText ?? ''}`.trim(),
            } as LoadState<Vm>)
          )
        )
      ),
      shareReplay(1)
    );
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ---- UI ----
  onSearchInput(v: string) {
    this.q = v;
    this.inputChanged$.next();
    this.syncUrl();
  }

  onSortChange(v: string) {
    this.sort = (v === 'name' ? 'name' : 'newest');
    this.syncUrl();
    this.search();
  }

  toggleOnlyNew() {
    this.onlyNew = !this.onlyNew;
    this.syncUrl();
    this.search();
  }

  onEnter(ev: KeyboardEvent) {
    if (ev.key === 'Enter') this.search();
  }

  search() {
    this.reload$.next();
  }

  reset() {
    this.q = '';
    this.sort = 'newest';
    this.onlyNew = false;
    this.syncUrl(true);
    this.search();
  }

  clearQuery() {
    if (!this.q) return;
    this.q = '';
    this.syncUrl();
    this.search();
  }

  private syncUrl(replace = true) {
    const queryParams: any = {
      q: this.q || null,
      sort: this.sort !== 'newest' ? this.sort : null,
      new: this.onlyNew ? '1' : null,
    };

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
      replaceUrl: replace,
    });
  }

  // ---- template helpers ----
  img(url?: string | null) {
    if (!url) return null;
    return `${this.api}${url}`;
  }

  brand(a: PublicAcademy) {
    return a.primaryColor || '#7c3aed';
  }

  subtitle(a: PublicAcademy) {
    const d = (a.description || '').trim();
    return d || a.slug || '';
  }

  isNew(a: PublicAcademy) {
    if (!a.publishedAt) return false;
    const t = Date.parse(a.publishedAt);
    if (!Number.isFinite(t)) return false;
    const days = (Date.now() - t) / (1000 * 60 * 60 * 24);
    return days <= 14;
  }

  updatedLabel(a: PublicAcademy) {
    return !!a.publishedAt;
  }

  private sortByPublishedDesc(list: PublicAcademy[]) {
    return [...(list ?? [])].sort((a, b) => {
      const ta = this.safeTime(a?.publishedAt);
      const tb = this.safeTime(b?.publishedAt);
      return tb - ta;
    });
  }

  private safeTime(v?: string | null) {
    if (!v) return 0;
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : 0;
  }
}
