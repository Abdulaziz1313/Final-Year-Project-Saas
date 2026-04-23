import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
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

@Component({
  selector: 'app-first-login-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './first-login-password.html',
  styleUrl: './first-login-password.scss',
})
export class FirstLoginPasswordComponent implements OnInit {
  academySlug = '';
  academy: AcademyPublicInfo | null = null;

  step: 'loading' | 'form' | 'done' | 'invalid' = 'loading';
  invalidError = '';

  loading = false;
  error: string | null = null;
  success: string | null = null;

  showCurrent = false;
  showNew = false;
  showConfirm = false;

  year = new Date().getFullYear();
  api = environment.apiBaseUrl;

  branding: BrandingData = {};
  layout: LayoutData = {};

  form: FormGroup;

  constructor(
    private fb: FormBuilder,
    private auth: Auth,
    private route: ActivatedRoute,
    private router: Router
  ) {
    this.form = this.fb.group({
      currentPassword: ['', [Validators.required]],
      newPassword: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required, Validators.minLength(6)]],
    });
  }

  ngOnInit(): void {
    this.step = 'loading';

    if (!this.auth.isLoggedIn() || !this.auth.hasRole('Instructor')) {
      this.step = 'invalid';
      this.invalidError = 'You must sign in as instructor first.';
      return;
    }

    if (!this.auth.mustChangePassword()) {
      this.router.navigateByUrl('/instructor');
      return;
    }

    this.academySlug = (this.route.snapshot.queryParamMap.get('academy') ?? '').trim();

    if (this.academySlug) {
      this.auth.getAcademyInfo(this.academySlug).subscribe({
        next: (info) => {
          this.academy = info;
          this.branding = this.parseJson<BrandingData>(info.brandingJson);
          this.layout = this.parseJson<LayoutData>(info.layoutJson);
          this.step = 'form';
        },
        error: () => {
          this.step = 'form';
        },
      });
    } else {
      this.step = 'form';
    }
  }

  toggleCurrent(): void {
    this.showCurrent = !this.showCurrent;
  }

  toggleNew(): void {
    this.showNew = !this.showNew;
  }

  toggleConfirm(): void {
    this.showConfirm = !this.showConfirm;
  }

  submit(): void {
    this.error = null;
    this.success = null;

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const currentPassword = (this.form.value.currentPassword ?? '').trim();
    const newPassword = (this.form.value.newPassword ?? '').trim();
    const confirmPassword = (this.form.value.confirmPassword ?? '').trim();

    if (newPassword !== confirmPassword) {
      this.error = 'Passwords do not match.';
      return;
    }

    this.loading = true;

    this.auth.firstLoginChangePassword(currentPassword, newPassword)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (res) => {
          this.step = 'done';
          this.success = res?.message || 'Password changed. Please sign in again.';

          sessionStorage.setItem('login_notice', 'Password changed successfully. Please sign in again.');
          this.auth.logout();

          const url = this.academySlug
            ? `/login-instructor?academy=${encodeURIComponent(this.academySlug)}`
            : '/login';

          setTimeout(() => this.router.navigateByUrl(url), 600);
        },
        error: (err) => {
          this.error = typeof err?.error === 'string'
            ? err.error
            : 'Failed to change password. Please try again.';
        },
      });
  }

  img(url?: string | null): string | null {
    if (!url) return null;
    return url.startsWith('http') ? url : `${this.api}${url}`;
  }

  get accentColor(): string {
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

  get currentCtrl() { return this.form.get('currentPassword'); }
  get newCtrl() { return this.form.get('newPassword'); }
  get confirmCtrl() { return this.form.get('confirmPassword'); }
}