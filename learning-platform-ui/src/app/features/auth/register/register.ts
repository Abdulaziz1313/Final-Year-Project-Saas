import { Component, OnDestroy, QueryList, ViewChildren, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  AbstractControl, FormBuilder, FormGroup,
  ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators,
} from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { finalize } from 'rxjs/operators';
import { Auth } from '../../../core/services/auth';
import { ToastService } from '../../../shared/ui/toast.service';

type Step = 'start' | 'org-details' | 'verify';

const passwordsMatchValidator: ValidatorFn = (group: AbstractControl): ValidationErrors | null => {
  const pass = group.get('password')?.value;
  const confirm = group.get('confirmPassword')?.value;
  if (!pass || !confirm) return null;
  return pass === confirm ? null : { passwordsMismatch: true };
};

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './register.html',
  styleUrl: './register.scss',
})
export class RegisterComponent implements OnDestroy {
  step: Step = 'start';
  loading = false;
  error: string | null = null;
  showPassword = false;
  showConfirmPassword = false;
  resendIn = 0;
  private resendTimer: any = null;
  year = new Date().getFullYear();

  startForm: FormGroup;
  orgForm: FormGroup;
  verifyForm: FormGroup;

  codeDigits: string[] = Array(6).fill('');
  @ViewChildren('codeInput') codeInputs!: QueryList<ElementRef<HTMLInputElement>>;

  constructor(
    private fb: FormBuilder,
    private auth: Auth,
    private router: Router,
    private toast: ToastService
  ) {
    this.startForm = this.fb.group({
      email:           ['', [Validators.required, Validators.email]],
      phone:           ['', [Validators.required, Validators.minLength(7), Validators.maxLength(20), Validators.pattern(/^[+0-9()\-\s]+$/)]],
      password:        ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]],
    }, { validators: passwordsMatchValidator });

    this.orgForm = this.fb.group({
      orgName:     ['', [Validators.required, Validators.minLength(2)]],
      website:     [''],
      description: [''],
    });

    this.verifyForm = this.fb.group({
      code: ['', [Validators.required, Validators.minLength(6)]],
    });
  }

  ngOnDestroy() { if (this.resendTimer) clearInterval(this.resendTimer); }

  togglePassword()        { this.showPassword = !this.showPassword; }
  toggleConfirmPassword() { this.showConfirmPassword = !this.showConfirmPassword; }

  // ── Step 1 → 2 ───────────────────────────────────────────
  goToOrgDetails() {
    this.error = null;
    if (this.startForm.invalid) { this.startForm.markAllAsTouched(); return; }
    this.step = 'org-details';
  }
  backToStart() { this.step = 'start'; this.error = null; }

  // ── Step 2 → 3: send OTP ──────────────────────────────────
  sendCode() {
    this.error = null;
    if (this.orgForm.invalid) { this.orgForm.markAllAsTouched(); return; }
    const { email, phone, password } = this.startForm.value;
    this.loading = true;
    this.auth.orgRegisterStart(email!, password!, phone!)
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
  backToOrgDetails() {
    this.step = 'org-details'; this.error = null;
    this.codeDigits = Array(6).fill(''); this.verifyForm.reset({ code: '' });
  }

  // ── Step 3: verify + create org ───────────────────────────
  submitVerify() {
    this.error = null;
    this.syncCodeToForm();
    if (this.verifyForm.invalid) {
      this.verifyForm.markAllAsTouched();
      this.error = 'Please enter the 6-digit code.';
      return;
    }
    const email = this.startForm.value.email as string;
    const code  = this.verifyForm.value.code as string;
    const { orgName, website, description } = this.orgForm.value;
    this.loading = true;
    this.auth.orgRegisterConfirm(email, code, orgName, website, description)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (res: any) => {
          sessionStorage.setItem('login_notice', `Organization "${res?.orgName ?? orgName}" created! Please log in.`);
          this.router.navigateByUrl('/login');
        },
        error: (err: any) => {
          this.error = typeof err?.error === 'string' ? err.error : 'Invalid code.';
        },
      });
  }

  resendCode() {
    if (this.resendIn > 0) return;
    const { email, phone, password } = this.startForm.value;
    this.loading = true;
    this.auth.orgRegisterStart(email, password, phone)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: () => {
          this.toast.success('New code sent.');
          this.startCooldown(30);
          this.codeDigits = Array(6).fill('');
          this.verifyForm.setValue({ code: '' });
          setTimeout(() => this.focusCode(0), 0);
        },
        error: (err: any) => { this.error = typeof err?.error === 'string' ? err.error : 'Failed to resend.'; },
      });
  }

  // ── OTP helpers ───────────────────────────────────────────
  onDigitInput(index: number, ev: Event) {
    const input = ev.target as HTMLInputElement;
    const v = (input.value || '').replace(/\D/g, '');
    if (v.length > 1) { this.applyFullCode(v); return; }
    this.codeDigits[index] = v; input.value = v; this.syncCodeToForm();
    if (v && index < 5) this.focusCode(index + 1);
  }
  onDigitKeyDown(index: number, ev: KeyboardEvent) {
    if (ev.key === 'Backspace') {
      if (this.codeDigits[index]) { this.codeDigits[index] = ''; this.syncCodeToForm(); return; }
      if (index > 0) { this.focusCode(index - 1); this.codeDigits[index - 1] = ''; this.syncCodeToForm(); ev.preventDefault(); }
      return;
    }
    if (ev.key === 'ArrowLeft'  && index > 0) { this.focusCode(index - 1); ev.preventDefault(); }
    if (ev.key === 'ArrowRight' && index < 5) { this.focusCode(index + 1); ev.preventDefault(); }
  }
  onCodePaste(ev: ClipboardEvent) {
    const t = (ev.clipboardData?.getData('text') || '').trim();
    if (!t) return; ev.preventDefault(); this.applyFullCode(t);
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
  private syncCodeToForm() { this.verifyForm.setValue({ code: this.codeDigits.join('') }, { emitEvent: false }); }
  private focusCode(i: number) { const el = this.codeInputs?.toArray()?.[i]?.nativeElement; if (el) { el.focus(); el.select(); } }
  private startCooldown(s: number) {
    this.resendIn = s;
    if (this.resendTimer) clearInterval(this.resendTimer);
    this.resendTimer = setInterval(() => { this.resendIn = Math.max(0, this.resendIn - 1); if (this.resendIn === 0) { clearInterval(this.resendTimer); this.resendTimer = null; } }, 1000);
  }

  get emailCtrl()       { return this.startForm.get('email'); }
  get phoneCtrl()       { return this.startForm.get('phone'); }
  get passCtrl()        { return this.startForm.get('password'); }
  get confirmPassCtrl() { return this.startForm.get('confirmPassword'); }
  get orgNameCtrl()     { return this.orgForm.get('orgName'); }
  get passwordsMismatch() { return !!this.startForm.errors?.['passwordsMismatch'] && (!!this.confirmPassCtrl?.touched || !!this.passCtrl?.touched); }
}