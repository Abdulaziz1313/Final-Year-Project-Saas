import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map, shareReplay, startWith, switchMap } from 'rxjs/operators';

import { ProfileApi, ProfileDto } from '../../core/services/profile-api';
import { NotificationApi, NotificationItem } from '../../core/services/notification-api';
import { environment } from '../../../environments/environment';

const KEY = 'alef_sidebar_collapsed';

type LoadState<T> = { loading: boolean; data: T | null; error: string | null };

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.scss',
})
export class AppShellComponent {
  collapsed = false;

  private reloadProfile$ = new BehaviorSubject<void>(undefined);
  profileState$: Observable<LoadState<ProfileDto>>;

  // Notifications
  notifOpen = false;
  private reloadCount$ = new BehaviorSubject<void>(undefined);
  private reloadList$ = new BehaviorSubject<void>(undefined);

  unreadCount$: Observable<LoadState<number>>;
  notifList$: Observable<LoadState<NotificationItem[]>>;

  constructor(
    private profileApi: ProfileApi,
    private notifApi: NotificationApi,
    private router: Router
  ) {
    const saved = localStorage.getItem(KEY);
    this.collapsed = saved === '1';

    this.profileState$ = this.reloadProfile$.pipe(
      switchMap(() =>
        this.profileApi.getProfile().pipe(
          map((p) => ({ loading: false, data: p, error: null } as LoadState<ProfileDto>)),
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
          map((x) => ({ loading: false, data: (x.items ?? []).slice(0, 8), error: null } as LoadState<NotificationItem[]>)),
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
    const email = profile?.email || 'A';
    return email.slice(0, 1).toUpperCase();
  }

  isInstructor(profile: ProfileDto | null): boolean {
    const roles = profile?.roles || [];
    return roles.includes('Instructor');
  }

  // ---- Notifications UI ----
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
      error: () => this.refreshNotifs()
    });
  }

  openNotification(n: NotificationItem) {
    // mark read first (best effort)
    if (!n.isRead) {
      this.notifApi.markRead(n.id).subscribe({ next: () => this.refreshNotifs(), error: () => {} });
    }

    this.notifOpen = false;

    if (n.linkUrl) {
      this.router.navigateByUrl(n.linkUrl);
    }
  }

  timeAgo(iso: string): string {
    const d = new Date(iso).getTime();
    const now = Date.now();
    const sec = Math.max(1, Math.floor((now - d) / 1000));

    if (sec < 60) return `${sec}s`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h`;
    const day = Math.floor(hr / 24);
    return `${day}d`;
  }

  isStudent(profile: ProfileDto | null): boolean {
  const roles = profile?.roles || [];
  return roles.includes('Student');
}
}
