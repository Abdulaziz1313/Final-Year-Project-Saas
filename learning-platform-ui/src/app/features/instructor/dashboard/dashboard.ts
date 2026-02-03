import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Router } from '@angular/router';
import { Auth } from '../../../core/services/auth';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map, shareReplay, startWith, switchMap, tap } from 'rxjs/operators';

import { InstructorApi, AcademyDto } from '../../../core/services/instructor-api';
import { ProfileApi, ProfileDto } from '../../../core/services/profile-api';
import { environment } from '../../../../environments/environment';

type LoadState<T> = {
  loading: boolean;
  data: T;
  error: string | null;
};

@Component({
  selector: 'app-instructor-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class DashboardComponent {
  apiBaseUrl = environment.apiBaseUrl;

  // triggers
  private reloadAcademies$ = new BehaviorSubject<void>(undefined);
  private reloadProfile$ = new BehaviorSubject<void>(undefined);

  // upload state
  photoUploading = false;

  // publish toggle per academy
  publishingIds = new Set<string>();

  academiesState$: Observable<LoadState<AcademyDto[]>>;
  profileState$: Observable<LoadState<ProfileDto | null>>;

  constructor(
    private api: InstructorApi,
    private profileApi: ProfileApi,
    private auth: Auth,
    private router: Router
  ) {
    this.academiesState$ = this.reloadAcademies$.pipe(
      switchMap(() =>
        this.api.getMyAcademies().pipe(
          map((res) => ({ loading: false, data: res ?? [], error: null } as LoadState<AcademyDto[]>)),
          startWith({ loading: true, data: [], error: null } as LoadState<AcademyDto[]>),
          catchError((err) =>
            of({
              loading: false,
              data: [],
              error: `Failed to load academies: ${err?.status ?? ''} ${err?.statusText ?? ''}`.trim(),
            } as LoadState<AcademyDto[]>)
          )
        )
      ),
      shareReplay(1)
    );

    this.profileState$ = this.reloadProfile$.pipe(
      switchMap(() =>
        this.profileApi.getProfile().pipe(
          map((p) => ({ loading: false, data: p ?? null, error: null } as LoadState<ProfileDto | null>)),
          startWith({ loading: true, data: null, error: null } as LoadState<ProfileDto | null>),
          catchError((err) =>
            of({
              loading: false,
              data: null,
              error: `Failed to load profile: ${err?.status ?? ''} ${err?.statusText ?? ''}`.trim(),
            } as LoadState<ProfileDto | null>)
          )
        )
      ),
      shareReplay(1)
    );
  }

  refreshAll() {
    this.reloadProfile$.next();
    this.reloadAcademies$.next();
  }

  refreshAcademies() {
    this.reloadAcademies$.next();
  }

  refreshProfile() {
    this.reloadProfile$.next();
  }

  avatarUrl(profile: ProfileDto | null): string | null {
    if (!profile?.profileImageUrl) return null;
    return `${this.apiBaseUrl}${profile.profileImageUrl}?t=${Date.now()}`;
  }

  onPhotoSelected(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.photoUploading = true;

    this.profileApi.uploadPhoto(file).pipe(
      tap(() => {
        this.reloadProfile$.next();
        this.reloadAcademies$.next();
      }),
      catchError(() => {
        alert('Upload failed');
        return of(null);
      })
    ).subscribe({
      next: () => {
        this.photoUploading = false;
        input.value = '';
      },
      error: () => {
        this.photoUploading = false;
        input.value = '';
      }
    });
  }

  logout() {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }

  deleteAcademy(id: string, name: string) {
    if (!confirm(`Delete academy "${name}"? This cannot be undone.`)) return;

    this.api.deleteAcademy(id).subscribe({
      next: () => this.refreshAcademies(),
      error: (err) => alert(`Delete failed: ${err?.status} ${err?.statusText}`)
    });
  }

  // ✅ Publish/unpublish toggle
  isPublishing(id: string): boolean {
    return this.publishingIds.has(id);
  }

  togglePublish(ev: Event, academy: AcademyDto) {
    ev.preventDefault();
    ev.stopPropagation();

    const id = academy.id;
    if (this.isPublishing(id)) return;

    const next = !(academy.isPublished ?? false);

    this.publishingIds.add(id);

    this.api.setAcademyPublish(id, next).subscribe({
      next: () => {
        // Reload list so we get authoritative state from backend
        this.refreshAcademies();
        this.publishingIds.delete(id);
      },
      error: (err) => {
        this.publishingIds.delete(id);
        alert(`Update failed: ${err?.status ?? ''} ${err?.statusText ?? ''}`.trim());
      }
    });
  }
}
