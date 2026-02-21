import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { BehaviorSubject, Subject, firstValueFrom, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, tap } from 'rxjs/operators';
import { StudentApi, CatalogListResponse } from '../../../core/services/student-api';
import { environment } from '../../../../environments/environment';

type LoadState<T> = { loading: boolean; data: T | null; error: string | null };

type CatalogVm = {
  academy: CatalogListResponse['academy'];
  total: number;
  page: number;
  pageSize: number;
  items: CatalogListResponse['items'];
};

@Component({
  selector: 'app-academy-catalog',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './academy-catalog.html',
  styleUrl: './academy-catalog.scss',
})
export class AcademyCatalogComponent implements OnDestroy {
  api = environment.apiBaseUrl;

  slug = '';
  q = '';
  tag = '';
  sort = 'newest';

  page = 1;
  pageSize = 24;

  // Branding
  brandColor = '#7c3aed';
  brandFontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';

  private stateSubject = new BehaviorSubject<LoadState<CatalogVm>>({ loading: true, data: null, error: null });
  state$ = this.stateSubject.asObservable();

  private qInput$ = new Subject<string>();
  private tagInput$ = new Subject<string>();

  private customFontStyleId = 'alef-academy-font-style';

  constructor(private route: ActivatedRoute, private router: Router, private student: StudentApi) {
    this.slug = this.route.snapshot.paramMap.get('slug') || '';

    const qp = this.route.snapshot.queryParamMap;
    this.q = qp.get('q') || '';
    this.tag = qp.get('tag') || '';
    this.sort = qp.get('sort') || 'newest';

    const pageParam = Number(qp.get('page') || '1');
    this.page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;

    this.qInput$.pipe(debounceTime(300), distinctUntilChanged()).subscribe((v) => {
      this.q = v;
      this.resetAndLoad();
    });

    this.tagInput$.pipe(debounceTime(300), distinctUntilChanged()).subscribe((v) => {
      this.tag = v;
      this.resetAndLoad();
    });

    this.loadInitialUpToPage(this.page).catch(() => {
      this.page = 1;
      this.resetAndLoad();
    });
  }

  ngOnDestroy(): void {
    this.clearCustomFontStyle();
  }

  // ---------- UI handlers ----------
  onQInput(v: string) {
    this.qInput$.next(v);
  }

  onTagInput(v: string) {
    this.tagInput$.next(v);
  }

  onSortChange(v: string) {
    this.sort = v || 'newest';
    this.resetAndLoad();
  }

  clearQ() {
    this.q = '';
    this.resetAndLoad();
  }

  clearTag() {
    this.tag = '';
    this.resetAndLoad();
  }

  resetFilters() {
    this.q = '';
    this.tag = '';
    this.sort = 'newest';
    this.resetAndLoad();
  }

  loadMore() {
    const st = this.stateSubject.value;
    if (st.loading) return;
    if (!st.data) return;
    if (st.data.items.length >= st.data.total) return;

    this.page += 1;
    this.syncUrl();
    this.load(false);
  }

  get canLoadMore(): boolean {
    const st = this.stateSubject.value;
    if (st.loading) return false;
    if (!st.data) return false;
    return st.data.items.length < st.data.total;
  }

  // ---------- loading ----------
  private async loadInitialUpToPage(targetPage: number) {
    const safeTarget = Math.max(1, Math.min(targetPage, 10));
    this.page = 1;
    this.syncUrl();

    await this.load(true);
    for (let p = 2; p <= safeTarget; p++) {
      this.page = p;
      this.syncUrl();
      await this.load(false);
    }
  }

  private resetAndLoad() {
    this.page = 1;
    this.syncUrl();
    this.load(true);
  }

  private syncUrl() {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        q: this.q || null,
        tag: this.tag || null,
        sort: this.sort !== 'newest' ? this.sort : null,
        page: this.page !== 1 ? this.page : null,
      },
      replaceUrl: true,
    });
  }

  private async load(reset: boolean) {
    const prev = this.stateSubject.value.data;
    this.stateSubject.next({ loading: true, data: prev ?? null, error: null });

    const call$ = this.student.academyCourses(this.slug, this.q, this.tag, this.sort, this.page, this.pageSize).pipe(
      tap((res) => this.applyBrandingFromAcademy(res?.academy)),
      catchError((err) => {
        const msg =
          typeof err?.error === 'string'
            ? err.error
            : `Failed to load catalog: ${err?.status ?? ''} ${err?.statusText ?? ''}`.trim();
        this.stateSubject.next({ loading: false, data: prev ?? null, error: msg });
        return of(null as any);
      })
    );

    const res = await firstValueFrom(call$);
    if (!res) return;

    const nextItems = reset ? (res.items ?? []) : ([...(prev?.items ?? []), ...(res.items ?? [])]);

    const vm: CatalogVm = {
      academy: res.academy,
      total: res.total,
      page: res.page,
      pageSize: res.pageSize,
      items: nextItems,
    };

    this.stateSubject.next({ loading: false, data: vm, error: null });
  }

  // ---------- helpers ----------
  img(url?: string | null) {
    if (!url) return null;
    return url.startsWith('http') ? url : `${this.api}${url}`;
  }

  priceLabel(c: any) {
    return c.isFree ? 'Free' : `${c.price ?? 0} ${c.currency ?? 'EUR'}`;
  }

  hasTag(c: any): boolean {
    const raw = String(c?.tagsJson ?? '').trim();
    return raw.length > 0 && raw !== '[]';
  }

  tagList(c: any): string[] {
    const raw = String(c?.tagsJson ?? '').trim();
    if (!raw) return [];
    try {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.map((x) => String(x)).filter(Boolean) : [];
    } catch {
      return raw.split(',').map((x) => x.trim()).filter(Boolean);
    }
  }

  trackById(_: number, item: any) {
    return item?.id;
  }

  // ---------- Branding ----------
  private applyBrandingFromAcademy(academy: any) {
    if (!academy) return;

    this.brandColor = academy.primaryColor || '#7c3aed';

    const fontKey = (academy.fontKey || 'system').toLowerCase();
    const customFontUrl = academy.customFontUrl as string | null;
    const customFontFamily = (academy.customFontFamily || 'AlefCustomFont') as string;

    this.clearCustomFontStyle();

    if (fontKey === 'custom' && customFontUrl) {
      const absolute = this.img(customFontUrl) || '';
      this.injectFontFace(customFontFamily, absolute);
      this.brandFontFamily = `'${customFontFamily}', system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
      return;
    }

    this.brandFontFamily = this.fontCss(fontKey);
  }

  private fontCss(fontKey: string): string {
    switch (fontKey) {
      case 'inter':
        return `Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
      case 'poppins':
        return `Poppins, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
      case 'cairo':
        return `Cairo, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
      case 'tajawal':
        return `Tajawal, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
      case 'ibmplexar':
        return `"IBM Plex Sans Arabic", system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
      default:
        return `system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
    }
  }

  private injectFontFace(family: string, url: string) {
    if (!url) return;

    const lower = url.toLowerCase();
    const format =
      lower.endsWith('.woff2') ? 'woff2' :
      lower.endsWith('.woff') ? 'woff' :
      lower.endsWith('.otf') ? 'opentype' :
      'truetype';

    const css = `
@font-face {
  font-family: '${family}';
  src: url('${url}') format('${format}');
  font-display: swap;
}
`;

    const style = document.createElement('style');
    style.id = this.customFontStyleId;
    style.textContent = css;
    document.head.appendChild(style);
  }

  private clearCustomFontStyle() {
    const el = document.getElementById(this.customFontStyleId);
    if (el) el.remove();
  }
}
