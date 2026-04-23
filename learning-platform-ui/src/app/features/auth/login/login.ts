import { Component, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { finalize } from 'rxjs/operators';

import { Auth } from '../../../core/services/auth';
import { ToastService } from '../../../shared/ui/toast.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class LoginComponent {
  loading = false;
  error: string | null = null;

  showPassword = false;
  rememberMe = localStorage.getItem('alef_remember') === '1';

  form;
  loginNotice: string | null = null;

  year = new Date().getFullYear();

  constructor(
    private fb: FormBuilder,
    private auth: Auth,
    private router: Router,
    private zone: NgZone,
    private toast: ToastService
  ) {
    this.form = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
    });

    const msg = sessionStorage.getItem('login_notice');
    if (msg) {
      this.loginNotice = msg;
      setTimeout(() => this.toast.success(msg), 0);
      sessionStorage.removeItem('login_notice');
    }
  }

  // --- topbar helpers ---
  get isLoggedIn(): boolean {
    return !!this.auth.isLoggedIn?.();
  }

  get isOrgAdmin(): boolean {
    try { return this.auth.hasRole?.('OrgAdmin'); } catch { return false; }
  }

  get isAdmin(): boolean {
    try { return this.auth.hasRole?.('Admin'); } catch { return false; }
  }

  togglePassword() {
    this.showPassword = !this.showPassword;
  }

  setRemember(v: boolean) {
    this.rememberMe = v;
    localStorage.setItem('alef_remember', v ? '1' : '0');
  }

  // ✅ UPDATED: real navigation (backoffice forgot flow)
  forgotPassword() {
    this.router.navigateByUrl('/forgot-password');
  }

  private postLoginRedirect() {
    const returnUrl = sessionStorage.getItem('return_url');
    if (returnUrl) {
      sessionStorage.removeItem('return_url');
      return returnUrl;
    }

    if (this.auth.hasRole('Admin')) return '/admin';
    if (this.auth.hasRole('OrgAdmin')) return '/org/academies';

    // fallback (should not happen because backend blocks non-backoffice)
    return '/me';
  }

  submit() {
    this.error = null;

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading = true;
    const { email, password } = this.form.value;

    // Backend enforces Admin/OrgAdmin-only on /api/auth/login,
    // but we still verify on the client as a safety check.
    this.auth.login(email!, password!)
      .pipe(finalize(() => this.zone.run(() => (this.loading = false))))
      .subscribe({
        next: () => {
          this.zone.run(() => {
            const isBackoffice = this.auth.hasRole('Admin') || this.auth.hasRole('OrgAdmin');

            if (!isBackoffice) {
              this.auth.logout();
              this.error = 'This sign-in page is for admins and organizations only. Please use academy sign-in for students/instructors.';
              return;
            }

            this.router.navigateByUrl(this.postLoginRedirect());
          });
        },
        error: (err) => {
          this.zone.run(() => {
            // Backend returns clear messages, show string if present
            if (typeof err?.error === 'string') {
              this.error = err.error;
              return;
            }
            if (err?.status === 401) this.error = 'Incorrect email or password.';
            else this.error = 'Login failed. Please try again.';
          });
        }
      });
  }

  get emailCtrl() { return this.form.get('email'); }
  get passCtrl() { return this.form.get('password'); }
}