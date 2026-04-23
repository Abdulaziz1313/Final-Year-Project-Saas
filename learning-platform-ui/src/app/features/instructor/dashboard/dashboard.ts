import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { BehaviorSubject, Observable, of, combineLatest } from 'rxjs';
import { catchError, map, shareReplay, startWith, switchMap, tap } from 'rxjs/operators';

import { InstructorApi, AcademyDto } from '../../../core/services/instructor-api';
import { ProfileApi, ProfileDto } from '../../../core/services/profile-api';
import { Auth } from '../../../core/services/auth';
import { environment } from '../../../../environments/environment';
import { TranslatePipe } from '../../../shared/pipes/translate-pipe';
import { LanguageService } from '../../../core/services/language-services';

type LoadState<T> = { loading: boolean; data: T | null; error: string | null };

type AcademyVm = AcademyDto & {
  courseCount?: number;

  // moderation fields
  isHidden?: boolean;
  hiddenReason?: string | null;
  hiddenAt?: string | null;
  updatedAt?: string | null;
  createdAt?: string | null;
};

type RecentVm = {
  title: string;
  subtitle: string;
  href: any[]; // routerLink array
  pillText: string;
  pillOn: boolean;
};

type DashboardVm = {
  academies: AcademyVm[];
  email: string;
  userId: string;
  roles: string[];
  profileImageUrl?: string | null;

  academiesCount: number;
  publishedCount: number;
  draftCount: number;
  hiddenCount: number;
  accountHandle: string;

  recent: RecentVm | null;
};

@Component({
  selector: 'app-instructor-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslatePipe],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class DashboardComponent {
  apiBaseUrl = environment.apiBaseUrl;

  private reload$ = new BehaviorSubject<void>(undefined);
  state$: Observable<LoadState<DashboardVm>>;

  private avatarBust = Date.now();

  // publish toggle per academy
  publishingIds = new Set<string>();

  constructor(
    private api: InstructorApi,
    private profileApi: ProfileApi,
    private auth: Auth,
    private router: Router,
    public lang: LanguageService
  ) {
    this.state$ = this.reload$.pipe(
      tap(() => (this.avatarBust = Date.now())),
      switchMap(() => {
        const academies$ = this.api.getMyAcademies().pipe(
          map((list) => (list ?? []) as AcademyDto[])
        );

        const profile$ = this.profileApi.getProfile().pipe(
          map((p) => (p ?? null) as ProfileDto | null)
        );

        return combineLatest([profile$, academies$]).pipe(
          map(([profile, academies]) => {
            const patched: AcademyVm[] = (academies ?? []).map((a: any) => {
              const n =
                this.asNumber(a?.courseCount) ??
                this.asNumber(a?.CourseCount) ??
                this.asNumber(a?.coursesCount) ??
                this.asNumber(a?.courses_count) ??
                this.asNumber(a?.totalCourses) ??
                this.asNumber(a?.coursesTotal) ??
                (Array.isArray(a?.courses) ? a.courses.length : null) ??
                0;

              return {
                ...a,
                courseCount: n,

                // moderation fields
                isHidden: !!(a?.isHidden ?? a?.IsHidden),
                hiddenReason: (a?.hiddenReason ?? a?.HiddenReason ?? null) as string | null,
                hiddenAt: (a?.hiddenAt ?? a?.HiddenAt ?? null) as string | null,

                updatedAt: a?.updatedAt ?? a?.lastUpdatedAt ?? a?.modifiedAt ?? null,
                createdAt: a?.createdAt ?? a?.CreatedAt ?? null,
              };
            });

            const academiesCount = patched.length;

            // better KPI math:
            const hiddenCount = patched.reduce((n, a) => n + (a.isHidden ? 1 : 0), 0);
            const publishedCount = patched.reduce(
              (n, a) => n + ((a.isPublished ?? false) && !a.isHidden ? 1 : 0),
              0
            );

            // Draft = not published AND not hidden
            const draftCount = patched.reduce(
              (n, a) => n + (!(a.isPublished ?? false) && !a.isHidden ? 1 : 0),
              0
            );

            const email = profile?.email ?? '';
            const handle = (email.split('@')[0] || '—').trim() || '—';

            const recentAcademy = this.pickMostRecent(patched);
            const recent: RecentVm | null = recentAcademy
              ? {
                  title: recentAcademy.name || 'Academy',
                  subtitle: recentAcademy.description || recentAcademy.slug || 'Open academy to manage courses',
                  href: ['/instructor/courses', recentAcademy.id],
                  pillText: recentAcademy.isHidden
                    ? 'Hidden'
                    : (recentAcademy.isPublished ?? false) ? 'Published' : 'Draft',
                  pillOn: !!recentAcademy.isPublished && !recentAcademy.isHidden,
                }
              : null;

            const vm: DashboardVm = {
              academies: patched,
              email,
              userId: profile?.userId ?? '',
              roles: profile?.roles ?? [],
              profileImageUrl: profile?.profileImageUrl ?? null,

              academiesCount,
              publishedCount,
              draftCount,
              hiddenCount,
              accountHandle: handle,

              recent,
            };

            return { loading: false, data: vm, error: null } as LoadState<DashboardVm>;
          }),
          startWith({ loading: true, data: null, error: null } as LoadState<DashboardVm>),
          catchError((err) =>
            of({
              loading: false,
              data: null,
              error: `Failed to load dashboard: ${err?.status ?? ''} ${err?.statusText ?? ''}`.trim(),
            } as LoadState<DashboardVm>)
          )
        );
      }),
      shareReplay(1)
    );
  }

  reload() {
    this.reload$.next();
  }

  avatarUrl(vm: DashboardVm | null): string | null {
    if (!vm?.profileImageUrl) return null;
    return `${this.apiBaseUrl}${vm.profileImageUrl}?v=${this.avatarBust}`;
  }

  copyUserId(userId: string) {
    if (!userId) return;

    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(userId).catch(() => {});
      return;
    }

    try {
      const ta = document.createElement('textarea');
      ta.value = userId;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    } catch {

    }
  }

  logout() {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }

  // ---- Publish toggle ----
  isPublishing(id: string): boolean {
    return this.publishingIds.has(id);
  }

  canTogglePublish(a: AcademyVm): boolean {
    // admin-hidden academies cannot be published
    return !!a?.id && !this.isPublishing(a.id) && !a.isHidden;
  }

  togglePublish(ev: Event, academy: AcademyVm) {
    ev.preventDefault();
    ev.stopPropagation();

    if (!academy?.id) return;

    // block if hidden
    if (academy.isHidden) {
      alert('This academy is hidden by an admin. You cannot publish it until it is unhidden.');
      return;
    }

    const id = academy.id;
    if (this.isPublishing(id)) return;

    const next = !(academy.isPublished ?? false);

    this.publishingIds.add(id);

    this.api.setAcademyPublish(id, next).subscribe({
      next: () => {
        this.publishingIds.delete(id);
        this.reload();
      },
      error: (err) => {
        this.publishingIds.delete(id);
        alert(`Update failed: ${err?.status ?? ''} ${err?.statusText ?? ''}`.trim());
      },
    });
  }

  // Request review
  async requestReview(ev: Event, a: AcademyVm) {
    ev.preventDefault();
    ev.stopPropagation();

    if (!a?.id) return;

    const message = this.buildReviewRequestMessage(a);

    // Best: copy to clipboard
    const copied = await this.tryCopy(message);

    if (copied) {
      alert(
        'Request copied ✅\n\nNow paste it in your message to admin/support (email / WhatsApp / Zendesk).'
      );
      return;
    }

    // Fallback: show prompt for manual copy
    window.prompt(
      'Copy this message and send it to admin/support:',
      message
    );
  }

  private buildReviewRequestMessage(a: AcademyVm): string {
    const when = this.formatHiddenAt(a.hiddenAt) ?? 'Unknown date';
    const reason = (a.hiddenReason || '').trim() || 'No reason provided';

    const name = (a.name || 'Academy').trim();
    const slug = (a.slug || '').trim();

    return [
      'Request review for hidden academy',
      `Academy: ${name}`,
      `AcademyId: ${a.id}`,
      slug ? `Slug: ${slug}` : '',
      `HiddenAt: ${when}`,
      `HiddenReason: ${reason}`,
      '',
      'Hello Admin,',
      'My academy was hidden. Please review it and let me know what I should change to get it unhidden.',
    ].filter(Boolean).join('\n');
  }

  private async tryCopy(text: string): Promise<boolean> {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // ignore
    }

    // old fallback
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return !!ok;
    } catch {
      return false;
    }
  }

  // ---- helpers ----
  private pickMostRecent(list: AcademyVm[]): AcademyVm | null {
    if (!list || list.length === 0) return null;

    const withDates = list
      .filter(a => !!a.updatedAt || !!a.createdAt)
      .map(a => {
        const t = this.safeTime(a.updatedAt) ?? this.safeTime(a.createdAt) ?? 0;
        return { a, t };
      })
      .sort((x, y) => y.t - x.t);

    if (withDates.length > 0) return withDates[0].a;
    return list[list.length - 1];
  }

  private safeTime(v?: string | null): number | null {
    if (!v) return null;
    const t = Date.parse(v);
    return isFinite(t) ? t : null;
  }

  private asNumber(v: any): number | null {
    if (v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  formatHiddenAt(v?: string | null): string | null {
    if (!v) return null;
    const t = Date.parse(v);
    if (!Number.isFinite(t)) return null;
    return new Date(t).toLocaleString();
  }

  hiddenMessage(a: AcademyVm): string {
    const reason = (a.hiddenReason || '').trim();
    const when = this.formatHiddenAt(a.hiddenAt);
    if (reason && when) return `Hidden by admin on ${when}. Reason: ${reason}`;
    if (reason) return `Hidden by admin. Reason: ${reason}`;
    if (when) return `Hidden by admin on ${when}.`;
    return `Hidden by admin.`;
  }
}
