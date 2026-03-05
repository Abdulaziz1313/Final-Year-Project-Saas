import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { Auth, AcademyPublicInfo } from '../../../core/services/auth';

@Component({
  selector: 'app-login-academy',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './login-academy.html',
  styleUrl:    './login-academy.scss',
})
export class LoginAcademyComponent implements OnInit {
  academySlug = '';
  academy: AcademyPublicInfo | null = null;
  step: 'loading' | 'invalid' | 'form' = 'loading';
  invalidError = '';

  loading            = false;
  error: string|null = null;
  notice: string|null = null;
  showPassword       = false;
  year = new Date().getFullYear();

  form: FormGroup;

  constructor(
    private fb:     FormBuilder,
    private auth:   Auth,
    private route:  ActivatedRoute,
    private router: Router,
  ) {
    this.form = this.fb.group({
      email:    ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required]],
    });
  }

  ngOnInit() {
    // Pick up notice from registration redirect
    this.notice = sessionStorage.getItem('login_notice');
    if (this.notice) sessionStorage.removeItem('login_notice');

    this.academySlug = this.route.snapshot.queryParamMap.get('academy') ?? '';

    if (!this.academySlug) {
      // No slug → fall back to generic login
      this.router.navigateByUrl('/login');
      return;
    }

    this.auth.getAcademyInfo(this.academySlug).subscribe({
      next: (info) => { this.academy = info; this.step = 'form'; },
      error: (err) => {
        this.step = 'invalid';
        this.invalidError = err?.status === 404
          ? `Academy "${this.academySlug}" not found.`
          : 'Academy not found or inactive.';
      },
    });
  }

  togglePassword() { this.showPassword = !this.showPassword; }

  login() {
    this.error = null;
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const { email, password } = this.form.value;
    this.loading = true;
    this.auth.login(email!, password!)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: () => {
          const returnUrl = sessionStorage.getItem('return_url');
          if (returnUrl) {
            sessionStorage.removeItem('return_url');
            this.router.navigateByUrl(returnUrl);
          } else {
            this.router.navigateByUrl(this.postLoginRedirect());
          }
        },
        error: (err: any) => {
          this.error = typeof err?.error === 'string' ? err.error : 'Incorrect email or password.';
        },
      });
  }

  private postLoginRedirect(): string {
    if (this.auth.hasRole('Student'))    return `/academy/${this.academySlug}`;
    if (this.auth.hasRole('Instructor')) return '/instructor';
    if (this.auth.hasRole('OrgAdmin'))   return '/org/academies';
    if (this.auth.hasRole('Admin'))      return '/admin';
    return '/home';
  }

  get emailCtrl()   { return this.form.get('email'); }
  get passCtrl()    { return this.form.get('password'); }
  get accentColor() { return this.academy?.primaryColor ?? '#1a56db'; }
}