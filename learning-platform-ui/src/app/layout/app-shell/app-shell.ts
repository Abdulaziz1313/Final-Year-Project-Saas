
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { BehaviorSubject, Observable, forkJoin, of } from 'rxjs';
import { catchError, map, shareReplay, startWith, switchMap } from 'rxjs/operators';

import { ProfileApi, ProfileDto } from '../../core/services/profile-api';
import { NotificationApi, NotificationItem } from '../../core/services/notification-api';
import { InstructorApi, AcademyDto } from '../../core/services/instructor-api';
import { StudentApi } from '../../core/services/student-api';
import { OrgApi, AcademySummary } from '../../core/services/org-api';
import { Auth } from '../../core/services/auth';
import { LanguageService } from '../../core/services/language-services';
import { TranslatePipe } from '../../shared/pipes/translate-pipe';
import { environment } from '../../../environments/environment';

const KEY = 'alef_sidebar_collapsed';

type LoadState<T> = { loading: boolean; data: T | null; error: string | null };

type AcademyPublicMeta = {
  id: string;
  slug: string;
  name: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
};

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslatePipe],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
})
export class AppShellComponent {
  collapsed = false;

  instructorRevenueLink: any[] | null = null;
  instructorEarningsLink: any[] | null = null;
  orgPayoutsLink: any[] | null = null;
  orgPayoutSettingsLink: any[] | null = null;

  academyPublicHomeLink: any[] | null = null;
  academyPublicHomeHref: string | null = null;
  academyPublicMeta: AcademyPublicMeta | null = null;

  private reloadProfile$ = new BehaviorSubject<void>(undefined);
  profileState$: Observable<LoadState<ProfileDto>>;

  notifOpen = false;
  private reloadCount$ = new BehaviorSubject<void>(undefined);
  private reloadList$ = new BehaviorSubject<void>(undefined);

  unreadCount$: Observable<LoadState<number>>;
  notifList$: Observable<LoadState<NotificationItem[]>>;

  constructor(
    private profileApi: ProfileApi,
    private notifApi: NotificationApi,
    private instructorApi: InstructorApi,
    private studentApi: StudentApi,
    private orgApi: OrgApi,
    private router: Router,
    public lang: LanguageService,
    private auth: Auth
  ) {
    const saved = localStorage.getItem(KEY);
    this.collapsed = saved === '1';

    this.profileState$ = this.reloadProfile$.pipe(
      switchMap(() =>
        this.profileApi.getProfile().pipe(
          switchMap((p) => {
            const isInstructor = p?.roles?.includes('Instructor') ?? false;
            const isOrgAdmin   = p?.roles?.includes('OrgAdmin')   ?? false;
            const isAdmin      = p?.roles?.includes('Admin')      ?? false;
            const isStudent    = p?.roles?.includes('Student')    ?? false;

            if (isInstructor && !isOrgAdmin && !isAdmin) {
              return this.instructorApi.getMyAcademies().pipe(
                map((academies) => {
                  const list = academies ?? [];
                  const academyId = this.selectPreferredInstructorAcademyId(list);

                  this.instructorRevenueLink  = academyId ? ['/instructor/revenue',  academyId] : null;
                  this.instructorEarningsLink = academyId ? ['/instructor/earnings', academyId] : null;
                  this.orgPayoutsLink         = null;
                  this.orgPayoutSettingsLink  = null;

                  const preferred = academyId
                    ? (list.find((a) => a.id === academyId) ?? list[0] ?? null)
                    : (list[0] ?? null);

                  if (preferred) {
                    const slug = (preferred as any).slug?.trim() ?? '';
                    this.academyPublicHomeLink = slug ? ['/academy-home', slug] : null;
                    this.academyPublicHomeHref = slug
                      ? `${window.location.origin}/#/academy-home/${encodeURIComponent(slug)}`
                      : null;
                    this.academyPublicMeta = {
                      id:           preferred.id,
                      slug:         (preferred as any).slug ?? '',
                      name:         preferred.name ?? '',
                      logoUrl:      (preferred as any).logoUrl ?? null,
                      primaryColor: (preferred as any).primaryColor ?? '#7c3aed',
                    };
                  } else {
                    this.clearAcademyMeta();
                  }

                  return { loading: false, data: p, error: null } as LoadState<ProfileDto>;
                }),
                catchError(() => {
                  this.instructorRevenueLink  = null;
                  this.instructorEarningsLink = null;
                  this.orgPayoutsLink         = null;
                  this.orgPayoutSettingsLink  = null;
                  this.clearAcademyMeta();
                  return of({ loading: false, data: p, error: null } as LoadState<ProfileDto>);
                })
              );
            }

            if (isOrgAdmin && !isAdmin) {
              return forkJoin({ academies: this.orgApi.listAcademies() }).pipe(
                map(({ academies }) => {
                  const academy   = this.selectPreferredOrgAcademy(academies ?? []);
                  const academyId = academy?.id ?? null;

                  this.orgPayoutsLink        = academyId ? ['/org/payouts',         academyId] : null;
                  this.orgPayoutSettingsLink = academyId ? ['/org/payout-settings', academyId] : null;
                  this.instructorRevenueLink  = null;
                  this.instructorEarningsLink = null;

                  const slug = academy?.slug?.trim() ?? '';
                  this.academyPublicHomeLink = slug ? ['/academy-home', slug] : null;
                  this.academyPublicHomeHref = slug
                    ? `${window.location.origin}/#/academy-home/${encodeURIComponent(slug)}`
                    : null;
                  this.academyPublicMeta = academy
                    ? {
                        id:           academy.id,
                        slug:         academy.slug,
                        name:         academy.name,
                        logoUrl:      (academy as any).logoUrl ?? null,
                        primaryColor: (academy as any).primaryColor ?? '#7c3aed',
                      }
                    : null;

                  return { loading: false, data: p, error: null } as LoadState<ProfileDto>;
                }),
                catchError(() => {
                  this.orgPayoutsLink         = null;
                  this.orgPayoutSettingsLink  = null;
                  this.instructorRevenueLink  = null;
                  this.instructorEarningsLink = null;
                  this.clearAcademyMeta();
                  return of({ loading: false, data: p, error: null } as LoadState<ProfileDto>);
                })
              );
            }

            if (isStudent && !isAdmin && !isOrgAdmin && !isInstructor) {
              this.instructorRevenueLink  = null;
              this.instructorEarningsLink = null;
              this.orgPayoutsLink         = null;
              this.orgPayoutSettingsLink  = null;

              return this.studentApi.myAcademy().pipe(
                map((info) => this.applyStudentAcademyMeta(info, p)),
                catchError(() => {
                  this.clearAcademyMeta();
                  return of({ loading: false, data: p, error: null } as LoadState<ProfileDto>);
                })
              );
            }

            this.instructorRevenueLink  = null;
            this.instructorEarningsLink = null;
            this.orgPayoutsLink         = null;
            this.orgPayoutSettingsLink  = null;
            this.clearAcademyMeta();

            return of({ loading: false, data: p, error: null } as LoadState<ProfileDto>);
          }),
          startWith({ loading: true, data: null, error: null } as LoadState<ProfileDto>),
          catchError((err) =>
            of({
              loading: false,
              data: null,
              error: `Failed to load profile: ${err?.status ?? ''} ${err?.statusText ?? ''}`.trim(),
            } as LoadState<ProfileDto>)
          )
        )
      ),
      shareReplay(1)
    );

    this.unreadCount$ = this.reloadCount$.pipe(
      switchMap(() =>
        this.notifApi.unreadCount().pipe(
          map((x) => ({ loading: false, data: x.count ?? 0, error: null } as LoadState<number>)),
          startWith({ loading: true, data: 0, error: null } as LoadState<number>),
          catchError(() => of({ loading: false, data: 0, error: null } as LoadState<number>))
        )
      ),
      shareReplay(1)
    );

    this.notifList$ = this.reloadList$.pipe(
      switchMap(() =>
        this.notifApi.list(false).pipe(
          map((x) => ({
            loading: false,
            data: (x.items ?? []).slice(0, 8),
            error: null,
          }) as LoadState<NotificationItem[]>),
          startWith({ loading: true, data: [], error: null } as LoadState<NotificationItem[]>),
          catchError((err) =>
            of({
              loading: false,
              data: [],
              error: `Failed to load notifications: ${err?.status ?? ''} ${err?.statusText ?? ''}`.trim(),
            } as LoadState<NotificationItem[]>)
          )
        )
      ),
      shareReplay(1)
    );
  }

  private applyStudentAcademyMeta(info: any, p: ProfileDto): LoadState<ProfileDto> {
    const slug = info?.slug ?? '';
    this.academyPublicHomeLink = slug ? ['/academy-home', slug] : null;
    this.academyPublicHomeHref = slug
      ? `${window.location.origin}/#/academy-home/${encodeURIComponent(slug)}`
      : null;
    this.academyPublicMeta = info
      ? {
          id:           info.id ?? '',
          slug,
          name:         info.name ?? '',
          logoUrl:      info.logoUrl ?? null,
          primaryColor: info.primaryColor ?? '#7c3aed',
        }
      : null;
    return { loading: false, data: p, error: null } as LoadState<ProfileDto>;
  }

  private clearAcademyMeta(): void {
    this.academyPublicHomeLink = null;
    this.academyPublicHomeHref = null;
    this.academyPublicMeta = null;
  }

  private getCurrentAcademyIdFromUrl(): string | null {
    const url = this.router.url || '';
    const match = url.match(
      /\/(org\/payouts|org\/payout-settings|instructor\/revenue|instructor\/earnings|instructor\/courses|org\/academies)\/([0-9a-fA-F-]{36})/
    );
    return match?.[2] ?? null;
  }

  private selectPreferredInstructorAcademyId(academies: AcademyDto[]): string | null {
    if (!academies.length) return null;
    const currentId = this.getCurrentAcademyIdFromUrl();
    if (currentId && academies.some((a) => a.id === currentId)) return currentId;
    return academies[0]?.id ?? null;
  }

  private selectPreferredOrgAcademy(academies: AcademySummary[]): AcademySummary | null {
    if (!academies.length) return null;
    const currentId = this.getCurrentAcademyIdFromUrl();
    if (currentId) {
      const current = academies.find((a) => a.id === currentId);
      if (current) return current;
    }
    return (
      [...academies].sort(
        (a, b) => (b.instructorCount + b.courseCount) - (a.instructorCount + a.courseCount)
      )[0] ?? academies[0] ?? null
    );
  }

  get academyName(): string | null {
    const name = this.academyPublicMeta?.name;
    return name ? name.trim() || null : null;
  }

  academyLogoUrl(): string | null {
    const url = this.academyPublicMeta?.logoUrl;
    if (!url) return null;
    return url.startsWith('http') ? url : `${environment.apiBaseUrl}${url}`;
  }

  academyInitial(): string {
    return (this.academyPublicMeta?.name || 'A').slice(0, 1).toUpperCase();
  }

  academyAccent(): string {
    return this.academyPublicMeta?.primaryColor || '#7c3aed';
  }

  toggleSidebar() {
    this.collapsed = !this.collapsed;
    localStorage.setItem(KEY, this.collapsed ? '1' : '0');
  }

  refreshProfile() {
    this.reloadProfile$.next();
  }

  avatarUrl(profile: ProfileDto | null): string | null {
    if (!profile?.profileImageUrl) return null;
    return `${environment.apiBaseUrl}${profile.profileImageUrl}?t=${Date.now()}`;
  }

  initial(profile: ProfileDto | null): string {
    return (profile?.email || 'A').slice(0, 1).toUpperCase();
  }

  isAdmin(profile: ProfileDto | null): boolean {
    return profile?.roles?.includes('Admin') ?? false;
  }

  isOrgAdmin(profile: ProfileDto | null): boolean {
    return (profile?.roles?.includes('OrgAdmin') ?? false) && !this.isAdmin(profile);
  }

  isInstructor(profile: ProfileDto | null): boolean {
    return (profile?.roles?.includes('Instructor') ?? false)
      && !this.isAdmin(profile)
      && !this.isOrgAdmin(profile);
  }

  isStudent(profile: ProfileDto | null): boolean {
    return profile?.roles?.includes('Student') ?? false;
  }

  toggleNotif(open: boolean) {
    this.notifOpen = open;
    if (open) {
      this.reloadList$.next();
      this.reloadCount$.next();
    }
  }

  refreshNotifs() {
    this.reloadList$.next();
    this.reloadCount$.next();
  }

  markAllRead() {
    this.notifApi.markAllRead().subscribe({
      next: () => this.refreshNotifs(),
      error: () => this.refreshNotifs(),
    });
  }

  openNotification(n: NotificationItem) {
    if (!n.isRead) {
      this.notifApi.markRead(n.id).subscribe({
        next: () => this.refreshNotifs(),
        error: () => {},
      });
    }
    this.notifOpen = false;
    if (n.linkUrl) {
      this.router.navigateByUrl(n.linkUrl);
    }
  }

  timeAgo(iso: string): string {
    const sec = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
    if (sec < 60) return `${sec}s`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h`;
    return `${Math.floor(hr / 24)}d`;
  }
}