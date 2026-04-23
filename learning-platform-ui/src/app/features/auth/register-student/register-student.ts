import { Component, OnDestroy, QueryList, ViewChildren, ElementRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  AbstractControl, FormBuilder, FormGroup,
  ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators,
} from '@angular/forms';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { Auth, AcademyPublicInfo } from '../../../core/services/auth';
import { environment } from '../../../../environments/environment';

type Step = 'loading' | 'invalid' | 'credentials' | 'verify' | 'done';

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

const passwordsMatchValidator: ValidatorFn = (group: AbstractControl): ValidationErrors | null => {
  const pass = group.get('password')?.value;
  const confirm = group.get('confirmPassword')?.value;
  if (!pass || !confirm) return null;
  return pass === confirm ? null : { passwordsMismatch: true };
};

@Component({
  selector: 'app-register-student',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './register-student.html',
  styleUrl: './register-student.scss',
})
export class RegisterStudentComponent implements OnInit, OnDestroy {
  step: Step = 'loading';
  academySlug = '';
  academy: AcademyPublicInfoExtended | null = null;
  invalidError = '';

  api = environment.apiBaseUrl;
  loading = false;
  error: string | null = null;
  showPassword = false;
  showConfirm = false;
  resendIn = 0;
  private resendTimer: any = null;
  year = new Date().getFullYear();

  branding: BrandingData = {};
  layout: LayoutData = {};

  credForm: FormGroup;
  verifyForm: FormGroup;

  codeDigits: string[] = Array(6).fill('');
  @ViewChildren('codeInput') codeInputs!: QueryList<ElementRef<HTMLInputElement>>;

  constructor(
    private fb: FormBuilder,
    private auth: Auth,
    private route: ActivatedRoute,
    private router: Router,
  ) {
    this.credForm = this.fb.group({
      displayName: [''],
      email: ['', [Validators.required, Validators.email]],
      phone: ['', [
        Validators.required,
        Validators.minLength(7),
        Validators.maxLength(20),
        Validators.pattern(/^[+0-9()\-\s]+$/)
      ]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]],
    }, { validators: passwordsMatchValidator });

    this.verifyForm = this.fb.group({
      code: ['', [Validators.required, Validators.minLength(6)]],
    });
  }

  ngOnInit() {
    this.academySlug = (this.route.snapshot.queryParamMap.get('academy') ?? '').trim();

    if (!this.academySlug) {
      this.step = 'invalid';
      this.invalidError = 'No academy specified. Use the registration link provided by the academy.';
      return;
    }

    this.auth.getAcademyInfo(this.academySlug).subscribe({
      next: (info) => {
        this.academy = info as AcademyPublicInfoExtended;
        this.branding = this.parseJson<BrandingData>(this.academy.brandingJson);
        this.layout = this.parseJson<LayoutData>(this.academy.layoutJson);
        this.step = 'credentials';
      },
      error: (err) => {
        this.step = 'invalid';
        this.invalidError = err?.status === 404
          ? `Academy "${this.academySlug}" not found.`
          : 'Academy not found or inactive. Contact the academy for a valid link.';
      },
    });
  }

  ngOnDestroy() {
    if (this.resendTimer) clearInterval(this.resendTimer);
  }

  img(url?: string | null) {
    if (!url) return null;
    return url.startsWith('http') ? url : `${this.api}${url}`;
  }

  togglePassword() { this.showPassword = !this.showPassword; }
  toggleConfirm() { this.showConfirm = !this.showConfirm; }

  sendCode() {
    this.error = null;
    if (this.credForm.invalid) {
      this.credForm.markAllAsTouched();
      return;
    }

    const { email, phone, password } = this.credForm.value;
    this.loading = true;

    this.auth.studentRegisterStart(email, password, phone, this.academySlug)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: () => {
          this.step = 'verify';
          this.startCooldown(30);
          this.codeDigits = Array(6).fill('');
          this.verifyForm.setValue({ code: '' });
          setTimeout(() => this.focusCode(0), 0);
        },
        error: (err: any) => {
          this.error = typeof err?.error === 'string' ? err.error : 'Failed to send code. Try again.';
        },
      });
  }

  backToCredentials() {
    this.step = 'credentials';
    this.error = null;
    this.codeDigits = Array(6).fill('');
    this.verifyForm.reset({ code: '' });
  }

  submitVerify() {
    this.error = null;
    this.syncCodeToForm();

    if (this.verifyForm.invalid) {
      this.error = 'Please enter the 6-digit code.';
      return;
    }

    const email = this.credForm.value.email as string;
    const code = this.verifyForm.value.code as string;
    const displayName = (this.credForm.value.displayName as string | undefined) || undefined;

    this.loading = true;
    this.auth.studentRegisterConfirm(email, code, this.academySlug, displayName)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: () => {
          this.step = 'done';
        },
        error: (err: any) => {
          this.error = typeof err?.error === 'string' ? err.error : 'Invalid or expired code.';
        },
      });
  }

  resendCode() {
    if (this.resendIn > 0) return;

    const { email, phone, password } = this.credForm.value;
    this.loading = true;

    this.auth.studentRegisterStart(email, password, phone, this.academySlug)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: () => {
          this.startCooldown(30);
          this.codeDigits = Array(6).fill('');
          this.verifyForm.setValue({ code: '' });
          setTimeout(() => this.focusCode(0), 0);
        },
        error: (err: any) => {
          this.error = typeof err?.error === 'string' ? err.error : 'Failed to resend.';
        },
      });
  }

  goToLogin() {
    sessionStorage.setItem('login_notice', `Welcome to ${this.academy?.name ?? 'the academy'}! You can now log in.`);
    this.router.navigate(['/login-academy'], {
      queryParams: { academy: this.academySlug }
    });
  }

  onDigitInput(i: number, ev: Event) {
    const el = ev.target as HTMLInputElement;
    const v = (el.value || '').replace(/\D/g, '');
    if (v.length > 1) {
      this.applyFullCode(v);
      return;
    }
    this.codeDigits[i] = v;
    el.value = v;
    this.syncCodeToForm();
    if (v && i < 5) this.focusCode(i + 1);
  }

  onDigitKeyDown(i: number, ev: KeyboardEvent) {
    if (ev.key === 'Backspace') {
      if (this.codeDigits[i]) {
        this.codeDigits[i] = '';
        this.syncCodeToForm();
        return;
      }
      if (i > 0) {
        this.focusCode(i - 1);
        this.codeDigits[i - 1] = '';
        this.syncCodeToForm();
        ev.preventDefault();
      }
      return;
    }
    if (ev.key === 'ArrowLeft' && i > 0) {
      this.focusCode(i - 1);
      ev.preventDefault();
    }
    if (ev.key === 'ArrowRight' && i < 5) {
      this.focusCode(i + 1);
      ev.preventDefault();
    }
  }

  onCodePaste(ev: ClipboardEvent) {
    const t = (ev.clipboardData?.getData('text') || '').trim();
    if (!t) return;
    ev.preventDefault();
    this.applyFullCode(t);
  }

  private applyFullCode(text: string) {
    const d = text.replace(/\D/g, '').slice(0, 6);
    for (let i = 0; i < 6; i++) this.codeDigits[i] = d[i] || '';
    this.syncCodeToForm();

    setTimeout(() => {
      const arr = this.codeInputs?.toArray() || [];
      for (let i = 0; i < arr.length; i++) {
        arr[i].nativeElement.value = this.codeDigits[i] || '';
      }
      this.focusCode(Math.min(d.length, 5));
    }, 0);
  }

  private syncCodeToForm() {
    this.verifyForm.setValue({ code: this.codeDigits.join('') }, { emitEvent: false });
  }

  private focusCode(i: number) {
    const el = this.codeInputs?.toArray()?.[i]?.nativeElement;
    if (el) {
      el.focus();
      el.select();
    }
  }

  private startCooldown(s: number) {
    this.resendIn = s;
    if (this.resendTimer) clearInterval(this.resendTimer);
    this.resendTimer = setInterval(() => {
      this.resendIn = Math.max(0, this.resendIn - 1);
      if (this.resendIn === 0) {
        clearInterval(this.resendTimer);
        this.resendTimer = null;
      }
    }, 1000);
  }

  get emailCtrl() { return this.credForm.get('email'); }
  get phoneCtrl() { return this.credForm.get('phone'); }
  get passCtrl() { return this.credForm.get('password'); }
  get confirmCtrl() { return this.credForm.get('confirmPassword'); }

  get pwMismatch() {
    return !!this.credForm.errors?.['passwordsMismatch'] &&
      (!!this.confirmCtrl?.touched || !!this.passCtrl?.touched);
  }

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