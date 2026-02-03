import { Component, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map, shareReplay, startWith, switchMap, tap } from 'rxjs/operators';

import { ConfirmService } from '../../shared/ui/confirm.service';
import { ToastService } from '../../shared/ui/toast.service';
import { ProfileApi, ProfileDto } from '../../core/services/profile-api';
import { Auth } from '../../core/services/auth';
import { environment } from '../../../environments/environment';

type LoadState<T> = { loading: boolean; data: T | null; error: string | null };
type SectionKey = 'profile' | 'security' | 'prefs' | 'danger';

@Component({
  selector: 'app-me',
  standalone: true,
  imports: [CommonModule, RouterModule, ReactiveFormsModule],
  templateUrl: './me.html',
  styleUrl: './me.scss',
})
export class MeComponent {
  private reload$ = new BehaviorSubject<void>(undefined);
  state$: Observable<LoadState<ProfileDto>>;

  // UI section nav
  activeSection: SectionKey = 'profile';

  // Photo
  photoUploading = false;

  // Display name
  displayName = '';
  nameWorking = false;
  nameError: string | null = null;

  // Password
  pwWorking = false;
  pwError: string | null = null;
  pwSuccess: string | null = null;
  showCurrent = false;
  showNew = false;

  // Delete
  deleteWorking = false;
  deleteError: string | null = null;

  // Preferences
  lang = localStorage.getItem('alef_lang') || 'en';

  pwForm;
  deleteForm;

  constructor(
    private profileApi: ProfileApi,
    private auth: Auth,
    private router: Router,
    private fb: FormBuilder,
    private confirm: ConfirmService,
    private toast: ToastService
  ) {
    this.state$ = this.reload$.pipe(
      switchMap(() =>
        this.profileApi.getProfile().pipe(
          tap((p) => {
            // keep local displayName model (don’t mutate st.data directly)
            this.displayName = p?.displayName || '';
          }),
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

    this.pwForm = this.fb.group({
      currentPassword: ['', [Validators.required, Validators.minLength(6)]],
      newPassword: ['', [Validators.required, Validators.minLength(6)]],
    });

    this.deleteForm = this.fb.group({
      password: ['', [Validators.required, Validators.minLength(6)]],
    });
  }

  reload() {
    this.reload$.next();
  }

  avatarUrl(profile: ProfileDto | null): string | null {
    if (!profile?.profileImageUrl) return null;
    return `${environment.apiBaseUrl}${profile.profileImageUrl}?t=${Date.now()}`;
  }

  toggleCurrent() { this.showCurrent = !this.showCurrent; }
  toggleNew() { this.showNew = !this.showNew; }

  // ------- Section nav -------
  goTo(section: SectionKey) {
    this.activeSection = section;
    const el = document.getElementById(`sec-${section}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // optional: update active section while scrolling
  @HostListener('window:scroll')
  onScroll() {
    const keys: SectionKey[] = ['profile', 'security', 'prefs', 'danger'];
    let best: { key: SectionKey; top: number } | null = null;

    for (const k of keys) {
      const el = document.getElementById(`sec-${k}`);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      // choose the nearest section above top threshold
      if (r.top <= 120) {
        if (!best || r.top > best.top) best = { key: k, top: r.top };
      }
    }

    if (best) this.activeSection = best.key;
  }

  // ------- Photo upload -------
  onPhotoSelected(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      this.toast.error('Please select JPG, PNG, or WEBP.');
      input.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      this.toast.error('Max file size is 5MB.');
      input.value = '';
      return;
    }

    this.photoUploading = true;

    this.profileApi.uploadPhoto(file).subscribe({
      next: () => {
        this.photoUploading = false;
        input.value = '';
        this.toast.success('Profile photo updated.');
        this.reload();
      },
      error: () => {
        this.photoUploading = false;
        input.value = '';
        this.toast.error('Upload failed.');
      }
    });
  }

  // ------- Name -------
  saveName() {
    this.nameError = null;

    const value = (this.displayName || '').trim();
    this.nameWorking = true;

    this.profileApi.updateProfile(value || null).subscribe({
      next: () => {
        this.nameWorking = false;
        this.toast.success('Profile updated.');
        this.reload();
      },
      error: (err) => {
        this.nameWorking = false;
        this.nameError = typeof err?.error === 'string' ? err.error : 'Failed to update profile.';
        this.toast.error(this.nameError ?? 'Failed to update profile.');
      }
    });
  }

  // ------- Password -------
  async changePassword() {
    this.pwError = null;
    this.pwSuccess = null;

    if (this.pwForm.invalid) {
      this.pwForm.markAllAsTouched();
      return;
    }

    const { currentPassword, newPassword } = this.pwForm.value;

    const ok = await this.confirm.open({
      title: 'Change password?',
      message: 'You will be logged out immediately and must sign in again with the new password.',
      confirmText: 'Yes, change it',
      cancelText: 'Cancel'
    });

    if (!ok) return;

    this.pwWorking = true;

    this.profileApi.changePassword(currentPassword!, newPassword!).subscribe({
      next: (res) => {
        this.pwWorking = false;

        const msg = res?.message || 'Password updated successfully. Please sign in again.';
        this.pwSuccess = msg;

        sessionStorage.setItem('login_notice', msg);

        this.auth.logout();
        this.router.navigateByUrl('/login');
      },
      error: (err) => {
        this.pwWorking = false;
        this.pwError =
          typeof err?.error === 'string'
            ? err.error
            : err?.error?.message || 'Change password failed.';
        this.toast.error(this.pwError ?? 'Change password failed.');
      }
    });
  }

  // ------- Preferences -------
  setLang(v: string) {
    this.lang = v;
    localStorage.setItem('alef_lang', v);
    this.toast.success('Preference saved.');
  }

  // ------- Logout / Delete -------
  logout() {
    sessionStorage.removeItem('login_notice');
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }

  async deleteAccount() {
    this.deleteError = null;

    if (this.deleteForm.invalid) {
      this.deleteForm.markAllAsTouched();
      return;
    }

    const ok = await this.confirm.open({
      title: 'Delete account?',
      message: 'This will permanently delete your account and all your content. This cannot be undone.',
      confirmText: 'Yes, delete',
      cancelText: 'Cancel'
    });

    if (!ok) return;

    this.deleteWorking = true;
    const password = this.deleteForm.value.password!;

    this.profileApi.deleteAccount(password).subscribe({
      next: (res) => {
        this.deleteWorking = false;
        this.toast.success(res?.message || 'Account deleted.');

        this.auth.logout();
        this.router.navigateByUrl('/login');
      },
      error: (err) => {
        this.deleteWorking = false;
        this.deleteError = typeof err?.error === 'string' ? err.error : 'Delete failed.';
        this.toast.error(this.deleteError ?? 'Delete failed.');
      }
    });
  }
}
