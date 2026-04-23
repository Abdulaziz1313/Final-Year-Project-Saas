import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { Auth, AcademyPublicInfo } from '../../../core/services/auth';
import { environment } from '../../../../environments/environment';

type ThemeMode = 'light' | 'warm' | 'dark';
type SurfaceStyle = 'soft' | 'outline' | 'glass';
type RadiusKey = 'rounded' | 'sharp';
type AccentStyle = 'solid' | 'gradient';

type BrandingData = {
  themeMode?: ThemeMode | null;
  accentStyle?: AccentStyle | null;
};

type LayoutData = {
  surfaceStyle?: SurfaceStyle | null;
  radiusKey?: RadiusKey | null;
};

type AcademyPublicInfoExtended = AcademyPublicInfo & {
  brandingJson?: string | null;
  layoutJson?: string | null;
  fontKey?: string | null;
};

@Component({
  selector: 'app-login-instructor',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './login-instructor.html',
  styleUrl: './login-instructor.scss',
})
export class LoginInstructorComponent implements OnInit {
  academySlug = '';
  academy: AcademyPublicInfoExtended | null = null;
  step: 'loading' | 'invalid' | 'form' = 'loading';
  invalidError = '';

  api = environment.apiBaseUrl;
  loading = false;
  error: string | null = null;
  notice: string | null = null;
  showPassword = false;
  year = new Date().getFullYear();

  branding: BrandingData = {};
  layout: LayoutData = {};

  form: FormGroup;

  constructor(
    private fb: FormBuilder,
    private auth: Auth,
    private route: ActivatedRoute,
    private router: Router,
  ) {
    this.form = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required]],
    });
  }

  ngOnInit() {
    this.step = 'loading';

    this.notice = sessionStorage.getItem('login_notice');
    if (this.notice) sessionStorage.removeItem('login_notice');

    this.academySlug = (this.route.snapshot.queryParamMap.get('academy') ?? '').trim();

    if (!this.academySlug) {
      this.step = 'invalid';
      this.invalidError = 'No academy specified. Please use the instructor login link for your academy.';
      return;
    }

    this.auth.getAcademyInfo(this.academySlug).subscribe({
      next: (info) => {
        this.academy = info as AcademyPublicInfoExtended;
        this.branding = this.parseJson<BrandingData>(this.academy.brandingJson);
        this.layout = this.parseJson<LayoutData>(this.academy.layoutJson);
        this.step = 'form';
      },
      error: (err) => {
        this.step = 'invalid';
        this.invalidError = err?.status === 404
          ? `Academy "${this.academySlug}" not found.`
          : 'Academy not found or inactive.';
      },
    });
  }

  img(url?: string | null) {
    if (!url) return null;
    return url.startsWith('http') ? url : `${this.api}${url}`;
  }

  togglePassword() {
    this.showPassword = !this.showPassword;
  }

  forgotPassword() {
    this.router.navigate(['/forgot-password'], {
      queryParams: { academy: this.academySlug, mode: 'instructor' }
    });
  }

  login() {
    this.error = null;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { email, password } = this.form.value;
    this.loading = true;

    this.auth.loginInstructor(email!, password!, this.academySlug)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: () => {
          if (!this.auth.hasRole('Instructor')) {
            this.auth.logout();
            this.error = 'This account is not an instructor account.';
            return;
          }

          const tokenAcademyId = this.auth.getAcademyId();
          const pageAcademyId = this.academy?.id ?? null;

          if (!tokenAcademyId || !pageAcademyId || tokenAcademyId !== pageAcademyId) {
            this.auth.logout();
            this.error = 'This instructor account is not linked to this academy.';
            return;
          }

          if (this.auth.mustChangePassword()) {
            this.router.navigate(['/first-login-password'], { queryParams: { academy: this.academySlug } });
            return;
          }

          const returnUrl = sessionStorage.getItem('return_url');
          if (returnUrl) {
            sessionStorage.removeItem('return_url');
            this.router.navigateByUrl(returnUrl);
          } else {
            this.router.navigateByUrl('/instructor');
          }
        },
        error: (err: any) => {
          this.error = typeof err?.error === 'string' ? err.error : 'Incorrect email or password.';
        },
      });
  }

  get emailCtrl() { return this.form.get('email'); }
  get passCtrl() { return this.form.get('password'); }

  get accentColor() {
    return this.academy?.primaryColor ?? '#1a56db';
  }

  get themeMode(): ThemeMode {
    const v = this.branding?.themeMode;
    return v === 'dark' || v === 'warm' ? v : 'light';
  }

  get surfaceStyle(): SurfaceStyle {
    const v = this.layout?.surfaceStyle;
    return v === 'outline' || v === 'glass' ? v : 'soft';
  }

  get radiusKey(): RadiusKey {
    return this.layout?.radiusKey === 'sharp' ? 'sharp' : 'rounded';
  }

  get accentStyle(): AccentStyle {
    return this.branding?.accentStyle === 'gradient' ? 'gradient' : 'solid';
  }

  get pageClasses(): string[] {
    return [
      `theme-${this.themeMode}`,
      `surface-${this.surfaceStyle}`,
      `radius-${this.radiusKey}`,
      `accent-${this.accentStyle}`,
    ];
  }

  get fontFamilyPreview(): string {
    const key = (this.academy?.fontKey ?? 'system').toLowerCase();

    switch (key) {
      case 'inter':
        return `'Inter', 'DM Sans', system-ui, sans-serif`;
      case 'poppins':
        return `'Poppins', 'DM Sans', system-ui, sans-serif`;
      case 'cairo':
        return `'Cairo', 'DM Sans', system-ui, sans-serif`;
      case 'tajawal':
        return `'Tajawal', 'DM Sans', system-ui, sans-serif`;
      case 'ibmplexar':
        return `'IBM Plex Sans Arabic', 'DM Sans', system-ui, sans-serif`;
      default:
        return `'DM Sans', system-ui, sans-serif`;
    }
  }

  get primaryGradient(): string {
    const dark = this.shadeHex(this.accentColor, -18);
    return `linear-gradient(135deg, ${this.accentColor} 0%, ${dark} 100%)`;
  }

  get primaryButtonStyle(): Record<string, string | null> {
    if (this.accentStyle === 'gradient') {
      return {
        background: null,
        backgroundImage: this.primaryGradient,
        borderColor: 'transparent',
        color: '#ffffff',
      };
    }

    return {
      background: this.accentColor,
      backgroundImage: 'none',
      borderColor: this.accentColor,
      color: '#ffffff',
    };
  }

  private parseJson<T>(value?: string | null): T {
    if (!value || !value.trim()) return {} as T;

    try {
      return JSON.parse(value) as T;
    } catch {
      return {} as T;
    }
  }

  private shadeHex(hex: string, percent: number): string {
    const normalized = (hex || '').replace('#', '').trim();
    if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return '#1a56db';

    const num = parseInt(normalized, 16);
    let r = (num >> 16) & 255;
    let g = (num >> 8) & 255;
    let b = num & 255;

    const factor = (100 + percent) / 100;
    r = Math.max(0, Math.min(255, Math.round(r * factor)));
    g = Math.max(0, Math.min(255, Math.round(g * factor)));
    b = Math.max(0, Math.min(255, Math.round(b * factor)));

    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
  }
}