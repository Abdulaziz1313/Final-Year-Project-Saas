import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { finalize } from 'rxjs/operators';

import { Auth, AcademyPublicInfo } from '../../../core/services/auth';
import { environment } from '../../../../environments/environment';

type Mode = 'student' | 'instructor' | 'backoffice';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './forgot-password.html',
  styleUrl: './forgot-password.scss',
})
export class ForgotPasswordComponent implements OnInit {
  academySlug = '';
  academy: AcademyPublicInfo | null = null;

  mode: Mode = 'backoffice';

  step: 'loading' | 'form' | 'sent' | 'invalid' = 'loading';
  invalidError = '';

  loading = false;
  error: string | null = null;
  success: string | null = null;

  year = new Date().getFullYear();
  api = environment.apiBaseUrl;

  form: FormGroup;

  pageClasses: string[] = [];
  fontFamilyPreview = `'DM Sans', sans-serif`;

  constructor(
    private fb: FormBuilder,
    private auth: Auth,
    private route: ActivatedRoute,
    private router: Router
  ) {
    this.form = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
    });
  }

  ngOnInit(): void {
    this.step = 'loading';
    this.error = null;
    this.success = null;

    this.academySlug = (this.route.snapshot.queryParamMap.get('academy') ?? '').trim();

    const m = (this.route.snapshot.queryParamMap.get('mode') ?? '').trim().toLowerCase();
    this.mode = (m === 'student' || m === 'instructor') ? (m as Mode) : 'backoffice';

    const email = (this.route.snapshot.queryParamMap.get('email') ?? '').trim();
    if (email) this.form.patchValue({ email });

    if (this.academySlug) {
      this.auth.getAcademyInfo(this.academySlug).subscribe({
        next: (info) => {
          this.academy = info;
          this.applyAcademyTheme(info);
          this.step = 'form';
        },
        error: () => {
          this.academy = null;
          this.resetTheme();
          this.step = 'form';
        },
      });
    } else {
      this.resetTheme();
      this.step = 'form';
    }
  }

  img(url?: string | null) {
    if (!url) return null;
    return url.startsWith('http') ? url : `${this.api}${url}`;
  }

  submit(): void {
    this.error = null;
    this.success = null;

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const email = (this.form.value.email ?? '').trim();
    this.loading = true;

    this.auth.forgotPassword(email, this.academySlug || null)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (res) => {
          this.step = 'sent';
          this.success = res?.message || 'If the email exists, a reset link has been sent.';
        },
        error: (err) => {
          this.error = typeof err?.error === 'string'
            ? err.error
            : 'Failed to send reset link. Please try again.';
        },
      });
  }

  backToSignIn(): void {
    if (this.academySlug) {
      if (this.mode === 'instructor') {
        this.router.navigate(['/login-instructor'], { queryParams: { academy: this.academySlug } });
      } else {
        this.router.navigate(['/login-academy'], { queryParams: { academy: this.academySlug } });
      }
      return;
    }

    this.router.navigateByUrl('/login');
  }

  private resetTheme(): void {
    this.pageClasses = [];
    this.fontFamilyPreview = `'DM Sans', sans-serif`;
  }

  private applyAcademyTheme(info: AcademyPublicInfo): void {
    const branding = this.safeParseJson(info.brandingJson);
    const layout = this.safeParseJson(info.layoutJson);

    const classes: string[] = [];

    const theme = (branding?.theme ?? layout?.theme ?? '').toString().trim().toLowerCase();
    const radius = (branding?.radius ?? layout?.radius ?? '').toString().trim().toLowerCase();
    const surface = (branding?.surface ?? layout?.surface ?? '').toString().trim().toLowerCase();

    if (theme === 'dark') classes.push('theme-dark');
    if (theme === 'warm') classes.push('theme-warm');

    if (radius === 'sharp') classes.push('radius-sharp');

    if (surface === 'glass') classes.push('surface-glass');
    if (surface === 'outline') classes.push('surface-outline');

    this.pageClasses = classes;
    this.fontFamilyPreview = this.mapFontFamily(info.fontKey);
  }

  private safeParseJson(value?: string | null): any {
    if (!value || !value.trim()) return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  private mapFontFamily(fontKey?: string | null): string {
    const key = (fontKey ?? '').trim().toLowerCase();

    switch (key) {
      case 'inter':
        return `Inter, 'DM Sans', system-ui, sans-serif`;
      case 'poppins':
        return `Poppins, 'DM Sans', system-ui, sans-serif`;
      case 'manrope':
        return `Manrope, 'DM Sans', system-ui, sans-serif`;
      case 'outfit':
        return `Outfit, 'DM Sans', system-ui, sans-serif`;
      case 'instrument-serif':
        return `'Instrument Serif', 'DM Sans', serif`;
      default:
        return `'DM Sans', sans-serif`;
    }
  }

  get emailCtrl() { return this.form.get('email'); }
  get accentColor() { return this.academy?.primaryColor ?? '#1a56db'; }
  get academyName() { return this.academy?.name ?? 'Alef'; }
}