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

  // optional UI preference
  rememberMe = localStorage.getItem('alef_remember') === '1';

  form;

  // banner message shown on page (also used for toast)
  loginNotice: string | null = null;

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

  togglePassword() {
    this.showPassword = !this.showPassword;
  }

  setRemember(v: boolean) {
    this.rememberMe = v;
    localStorage.setItem('alef_remember', v ? '1' : '0');
  }

  private postLoginRedirect() {
    const returnUrl = sessionStorage.getItem('return_url');
    if (returnUrl) {
      sessionStorage.removeItem('return_url');
      return returnUrl;
    }

    // ✅ Admin goes to Admin panel
    if (this.auth.hasRole('Admin')) return '/admin';
    if (this.auth.hasRole('Instructor')) return '/instructor';
    if (this.auth.hasRole('Student')) return '/my-learning';
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

    this.auth.login(email!, password!)
      .pipe(
        finalize(() => {
          this.zone.run(() => (this.loading = false));
        })
      )
      .subscribe({
        next: () => {
          this.zone.run(() => {
            this.router.navigateByUrl(this.postLoginRedirect());
          });
        },
        error: (err) => {
          this.zone.run(() => {
            if (err?.status === 401) this.error = 'Incorrect email or password.';
            else this.error = 'Login failed. Please try again.';
          });
        }
      });
  }

  get emailCtrl() { return this.form.get('email'); }
  get passCtrl() { return this.form.get('password'); }
}
