import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { finalize } from 'rxjs/operators';

import { Auth, AcademyPublicInfo } from '../../../core/services/auth';

type Mode = 'student' | 'instructor' | 'backoffice';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './reset-password.html',
  styleUrl: './reset-password.scss',
})
export class ResetPasswordComponent implements OnInit {
  academySlug = '';
  academy: AcademyPublicInfo | null = null;

  mode: Mode = 'backoffice';

  email = '';
  token = '';

  step: 'loading' | 'form' | 'done' | 'invalid' = 'loading';
  invalidError = '';

  loading = false;
  error: string | null = null;
  success: string | null = null;

  showPassword = false;
  showConfirm = false;

  year = new Date().getFullYear();

  form: FormGroup;

  constructor(
    private fb: FormBuilder,
    private auth: Auth,
    private route: ActivatedRoute,
    private router: Router
  ) {
    this.form = this.fb.group({
      newPassword: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required, Validators.minLength(6)]],
    });
  }

  ngOnInit(): void {
    this.step = 'loading';
    this.error = null;
    this.success = null;

    const pm = this.route.snapshot.queryParamMap;

    this.email = (pm.get('email') ?? '').trim().toLowerCase();
    this.token = (pm.get('token') ?? '').trim();
    this.academySlug = (pm.get('academy') ?? '').trim();

    const m = (pm.get('mode') ?? '').trim().toLowerCase();
    this.mode = (m === 'student' || m === 'instructor') ? (m as Mode) : 'backoffice';

    if (!this.email || !this.token) {
      this.step = 'invalid';
      this.invalidError = 'Missing reset token or email. Please request a new reset link.';
      return;
    }

    // Optional branding (do not block reset if branding fails)
    if (this.academySlug) {
      this.auth.getAcademyInfo(this.academySlug).subscribe({
        next: (info) => {
          this.academy = info;
          this.step = 'form';
        },
        error: () => {
          this.academy = null;
          this.step = 'form';
        },
      });
    } else {
      this.step = 'form';
    }
  }

  togglePassword() { this.showPassword = !this.showPassword; }
  toggleConfirm() { this.showConfirm = !this.showConfirm; }

  submit(): void {
    this.error = null;
    this.success = null;

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const newPassword = (this.form.value.newPassword ?? '').trim();
    const confirmPassword = (this.form.value.confirmPassword ?? '').trim();

    if (newPassword !== confirmPassword) {
      this.error = 'Passwords do not match.';
      return;
    }

    this.loading = true;

    this.auth.resetPassword(this.email, this.token, newPassword)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (res) => {
          this.step = 'done';
          this.success = res?.message || 'Password updated successfully. You can login now.';

          sessionStorage.setItem('login_notice', 'Password updated successfully. Please sign in.');
        },
        error: (err) => {
          this.error = typeof err?.error === 'string'
            ? err.error
            : 'Reset failed. Please request a new reset link.';
        },
      });
  }

  goToSignIn(): void {
    if (this.academySlug) {
      if (this.mode === 'instructor') {
        this.router.navigate(['/login-instructor'], { queryParams: { academy: this.academySlug } });
      } else {
        // default student
        this.router.navigate(['/login-academy'], { queryParams: { academy: this.academySlug } });
      }
      return;
    }

    // backoffice
    this.router.navigateByUrl('/login');
  }

  get passCtrl() { return this.form.get('newPassword'); }
  get confirmCtrl() { return this.form.get('confirmPassword'); }
  get accentColor() { return this.academy?.primaryColor ?? '#1a56db'; }
  get academyName() { return this.academy?.name ?? 'Alef'; }
}