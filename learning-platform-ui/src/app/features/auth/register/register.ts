import { Component, OnDestroy, QueryList, ViewChildren, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { finalize } from 'rxjs/operators';

import { Auth, Role } from '../../../core/services/auth';
import { ToastService } from '../../../shared/ui/toast.service';

type Step = 'start' | 'verify';

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

  roles: Role[] = ['Student', 'Instructor'];

  showPassword = false;

  // resend cooldown
  resendIn = 0;
  private resendTimer: any = null;

  startForm;
  verifyForm;

  // 6-digit OTP inputs
  codeDigits: string[] = Array(6).fill('');

  @ViewChildren('codeInput') codeInputs!: QueryList<ElementRef<HTMLInputElement>>;

  constructor(
    private fb: FormBuilder,
    private auth: Auth,
    private router: Router,
    private toast: ToastService
  ) {
    this.startForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      role: ['Student' as Role, [Validators.required]],
    });

    // keep verifyForm for validation + submit
    this.verifyForm = this.fb.group({
      code: ['', [Validators.required, Validators.minLength(6)]],
    });
  }

  ngOnDestroy(): void {
    if (this.resendTimer) clearInterval(this.resendTimer);
  }

  togglePassword() {
    this.showPassword = !this.showPassword;
  }

  private startCooldown(seconds: number) {
    this.resendIn = seconds;
    if (this.resendTimer) clearInterval(this.resendTimer);

    this.resendTimer = setInterval(() => {
      this.resendIn = Math.max(0, this.resendIn - 1);
      if (this.resendIn === 0 && this.resendTimer) {
        clearInterval(this.resendTimer);
        this.resendTimer = null;
      }
    }, 1000);
  }

  submitStart() {
    this.error = null;

    if (this.startForm.invalid) {
      this.startForm.markAllAsTouched();
      return;
    }

    const { email, password, role } = this.startForm.value;

    this.loading = true;

    this.auth.registerStart(email!, password!, role!)
      .pipe(finalize(() => this.loading = false))
      .subscribe({
        next: () => {
          this.toast.success('Verification code sent to your email.');
          this.step = 'verify';
          this.startCooldown(30);

          // reset code UI
          this.codeDigits = Array(6).fill('');
          this.verifyForm.setValue({ code: '' });

          // focus first input after render
          setTimeout(() => this.focusCode(0), 0);
        },
        error: (err) => {
          this.error = typeof err?.error === 'string' ? err.error : 'Failed to send code.';
        }
      });
  }

  resendCode() {
    if (this.resendIn > 0) return;

    const { email, password, role } = this.startForm.value;
    if (!email || !password || !role) return;

    this.loading = true;

    this.auth.registerStart(email, password, role)
      .pipe(finalize(() => this.loading = false))
      .subscribe({
        next: () => {
          this.toast.success('New code sent.');
          this.startCooldown(30);
          this.codeDigits = Array(6).fill('');
          this.verifyForm.setValue({ code: '' });
          setTimeout(() => this.focusCode(0), 0);
        },
        error: (err) => {
          this.error = typeof err?.error === 'string' ? err.error : 'Failed to resend code.';
        }
      });
  }

  // --- OTP input handling ---
  onDigitInput(index: number, ev: Event) {
    const input = ev.target as HTMLInputElement;
    let v = (input.value || '').replace(/\D/g, '');

    // if user pasted multiple digits into a single box
    if (v.length > 1) {
      this.applyFullCode(v);
      return;
    }

    this.codeDigits[index] = v;
    input.value = v;

    this.syncCodeToForm();

    if (v && index < 5) {
      this.focusCode(index + 1);
    }
  }

  onDigitKeyDown(index: number, ev: KeyboardEvent) {
    const key = ev.key;

    if (key === 'Backspace') {
      if (this.codeDigits[index]) {
        // clear current
        this.codeDigits[index] = '';
        this.syncCodeToForm();
        return;
      }
      // move back if empty
      if (index > 0) {
        this.focusCode(index - 1);
        this.codeDigits[index - 1] = '';
        this.syncCodeToForm();
        ev.preventDefault();
      }
      return;
    }

    if (key === 'ArrowLeft' && index > 0) {
      this.focusCode(index - 1);
      ev.preventDefault();
      return;
    }

    if (key === 'ArrowRight' && index < 5) {
      this.focusCode(index + 1);
      ev.preventDefault();
      return;
    }
  }

  onCodePaste(ev: ClipboardEvent) {
    const text = (ev.clipboardData?.getData('text') || '').trim();
    if (!text) return;

    ev.preventDefault();
    this.applyFullCode(text);
  }

  private applyFullCode(text: string) {
    const digits = text.replace(/\D/g, '').slice(0, 6);
    for (let i = 0; i < 6; i++) this.codeDigits[i] = digits[i] || '';
    this.syncCodeToForm();

    // update inputs (if rendered)
    setTimeout(() => {
      const arr = this.codeInputs?.toArray() || [];
      for (let i = 0; i < arr.length; i++) arr[i].nativeElement.value = this.codeDigits[i] || '';
      const nextIndex = Math.min(digits.length, 5);
      this.focusCode(nextIndex);
    }, 0);
  }

  private syncCodeToForm() {
    const code = this.codeDigits.join('');
    this.verifyForm.setValue({ code }, { emitEvent: false });
  }

  private focusCode(i: number) {
    const el = this.codeInputs?.toArray()?.[i]?.nativeElement;
    if (!el) return;
    el.focus();
    el.select();
  }

  submitVerify() {
    this.error = null;

    this.syncCodeToForm();

    if (this.verifyForm.invalid) {
      this.verifyForm.markAllAsTouched();
      this.error = 'Please enter the 6-digit code.';
      return;
    }

    const email = this.startForm.value.email!;
    const code = this.verifyForm.value.code!;

    this.loading = true;

    this.auth.registerConfirm(email, code)
      .pipe(finalize(() => this.loading = false))
      .subscribe({
        next: (res) => {
          const msg = res?.message || 'Account created. Please login.';
          sessionStorage.setItem('login_notice', msg);
          this.router.navigateByUrl('/login');
        },
        error: (err) => {
          this.error = typeof err?.error === 'string' ? err.error : 'Invalid code.';
        }
      });
  }

  backToStart() {
    this.step = 'start';
    this.verifyForm.reset({ code: '' });
    this.codeDigits = Array(6).fill('');
    this.error = null;
  }

  changeEmail() {
    this.backToStart();
  }

  // convenient getters
  get emailCtrl() { return this.startForm.get('email'); }
  get passCtrl() { return this.startForm.get('password'); }
  get roleCtrl() { return this.startForm.get('role'); }
}
