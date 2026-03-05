import { Component, OnDestroy, QueryList, ViewChildren, ElementRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  AbstractControl, FormBuilder, FormGroup,
  ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators,
} from '@angular/forms';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { Auth, AcademyPublicInfo } from '../../../core/services/auth';
import { ToastService } from '../../../shared/ui/toast.service';

type Step = 'loading' | 'invalid' | 'credentials' | 'verify' | 'done';

const passwordsMatchValidator: ValidatorFn = (group: AbstractControl): ValidationErrors | null => {
  const pass    = group.get('password')?.value;
  const confirm = group.get('confirmPassword')?.value;
  if (!pass || !confirm) return null;
  return pass === confirm ? null : { passwordsMismatch: true };
};

@Component({
  selector: 'app-register-instructor',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './register-instructor.html',
  styleUrl: './register-instructor.scss',
})
export class RegisterInstructorComponent implements OnInit, OnDestroy {
  step: Step = 'loading';
  academySlug = '';
  academy: AcademyPublicInfo | null = null;
  invalidError = '';

  loading = false;
  error: string | null = null;
  showPassword = false;
  showConfirmPassword = false;
  resendIn = 0;
  private resendTimer: any = null;
  year = new Date().getFullYear();

  credForm: FormGroup;
  verifyForm: FormGroup;

  codeDigits: string[] = Array(6).fill('');
  @ViewChildren('codeInput') codeInputs!: QueryList<ElementRef<HTMLInputElement>>;

  constructor(
    private fb:     FormBuilder,
    private auth:   Auth,
    private route:  ActivatedRoute,
    private router: Router,
    private toast:  ToastService
  ) {
    this.credForm = this.fb.group({
      displayName:     [''],
      email:           ['', [Validators.required, Validators.email]],
      phone:           ['', [Validators.required, Validators.minLength(7), Validators.maxLength(20), Validators.pattern(/^[+0-9()\-\s]+$/)]],
      password:        ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]],
    }, { validators: passwordsMatchValidator });

    this.verifyForm = this.fb.group({
      code: ['', [Validators.required, Validators.minLength(6)]],
    });
  }

  ngOnInit() {
    this.academySlug = this.route.snapshot.queryParamMap.get('academy') ?? '';

    if (!this.academySlug) {
      this.step = 'invalid';
      this.invalidError = 'No academy specified. Use the registration link provided by your organization.';
      return;
    }

    this.auth.getAcademyInfo(this.academySlug).subscribe({
      next: (info) => {
        this.academy = info;
        this.step = 'credentials';
      },
      error: (err) => {
        console.error('Academy info error:', err);
        this.step = 'invalid';
        this.invalidError = err?.status === 404
          ? `Academy "${this.academySlug}" not found. Check the link is correct.`
          : 'Academy not found or inactive. Please contact your organization for a valid registration link.';
      },
    });
  }

  ngOnDestroy() {
    if (this.resendTimer) clearInterval(this.resendTimer);
  }

  togglePassword()        { this.showPassword        = !this.showPassword; }
  toggleConfirmPassword() { this.showConfirmPassword = !this.showConfirmPassword; }

  sendCode() {
    this.error = null;
    if (this.credForm.invalid) { this.credForm.markAllAsTouched(); return; }
    const { email, phone, password } = this.credForm.value;
    this.loading = true;
    this.auth.instructorRegisterStart(email!, password!, phone!, this.academySlug)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: () => {
          this.toast.success('Verification code sent to your phone.');
          this.step = 'verify';
          this.startCooldown(30);
          this.codeDigits = Array(6).fill('');
          this.verifyForm.setValue({ code: '' });
          setTimeout(() => this.focusCode(0), 0);
        },
        error: (err: any) => {
          this.error = typeof err?.error === 'string' ? err.error : 'Failed to send code.';
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
      this.verifyForm.markAllAsTouched();
      this.error = 'Please enter the 6-digit code.';
      return;
    }
    const email       = this.credForm.value.email       as string;
    const code        = this.verifyForm.value.code       as string;
    const displayName = this.credForm.value.displayName as string | undefined;
    this.loading = true;
    this.auth.instructorRegisterConfirm(email, code, this.academySlug, displayName)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: () => { this.step = 'done'; },
        error: (err: any) => {
          this.error = typeof err?.error === 'string' ? err.error : 'Invalid code.';
        },
      });
  }

  resendCode() {
    if (this.resendIn > 0) return;
    const { email, phone, password } = this.credForm.value;
    this.loading = true;
    this.auth.instructorRegisterStart(email, password, phone, this.academySlug)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: () => {
          this.toast.success('New code sent.');
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
    sessionStorage.setItem('login_notice', `Welcome to ${this.academy?.name ?? 'Alef'}! You can now log in.`);
    this.router.navigateByUrl('/login');
  }

  // ── OTP input helpers ─────────────────────────────────────
  onDigitInput(i: number, ev: Event) {
    const el = ev.target as HTMLInputElement;
    const v = (el.value || '').replace(/\D/g, '');
    if (v.length > 1) { this.applyFullCode(v); return; }
    this.codeDigits[i] = v; el.value = v; this.syncCodeToForm();
    if (v && i < 5) this.focusCode(i + 1);
  }

  onDigitKeyDown(i: number, ev: KeyboardEvent) {
    if (ev.key === 'Backspace') {
      if (this.codeDigits[i]) { this.codeDigits[i] = ''; this.syncCodeToForm(); return; }
      if (i > 0) { this.focusCode(i - 1); this.codeDigits[i - 1] = ''; this.syncCodeToForm(); ev.preventDefault(); }
      return;
    }
    if (ev.key === 'ArrowLeft'  && i > 0) { this.focusCode(i - 1); ev.preventDefault(); }
    if (ev.key === 'ArrowRight' && i < 5) { this.focusCode(i + 1); ev.preventDefault(); }
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
      for (let i = 0; i < arr.length; i++) arr[i].nativeElement.value = this.codeDigits[i] || '';
      this.focusCode(Math.min(d.length, 5));
    }, 0);
  }

  private syncCodeToForm() {
    this.verifyForm.setValue({ code: this.codeDigits.join('') }, { emitEvent: false });
  }

  private focusCode(i: number) {
    const el = this.codeInputs?.toArray()?.[i]?.nativeElement;
    if (el) { el.focus(); el.select(); }
  }

  private startCooldown(s: number) {
    this.resendIn = s;
    if (this.resendTimer) clearInterval(this.resendTimer);
    this.resendTimer = setInterval(() => {
      this.resendIn = Math.max(0, this.resendIn - 1);
      if (this.resendIn === 0) { clearInterval(this.resendTimer); this.resendTimer = null; }
    }, 1000);
  }

  get emailCtrl()       { return this.credForm.get('email'); }
  get phoneCtrl()       { return this.credForm.get('phone'); }
  get passCtrl()        { return this.credForm.get('password'); }
  get confirmPassCtrl() { return this.credForm.get('confirmPassword'); }

  get passwordsMismatch() {
    return !!this.credForm.errors?.['passwordsMismatch'] &&
      (!!this.confirmPassCtrl?.touched || !!this.passCtrl?.touched);
  }

  get accentColor() {
    return this.academy?.primaryColor ?? '#1a56db';
  }
}