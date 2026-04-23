// me.ts
import {
  Component,
  HostListener,
  ViewChild,
  ElementRef,
  OnDestroy,
  AfterViewInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { BehaviorSubject, Observable, of, Subscription } from 'rxjs';
import { catchError, map, shareReplay, startWith, switchMap, tap } from 'rxjs/operators';
import { HttpClient, HttpEvent, HttpEventType } from '@angular/common/http';

import { ConfirmService } from '../../shared/ui/confirm.service';
import { ToastService } from '../../shared/ui/toast.service';
import { ProfileApi, ProfileDto } from '../../core/services/profile-api';
import { Auth } from '../../core/services/auth';
import { LanguageService, AppLang } from '../../core/services/language-services';
import { TranslatePipe } from '../../shared/pipes/translate-pipe';
import { environment } from '../../../environments/environment';

type LoadState<T> = { loading: boolean; data: T | null; error: string | null };
type SectionKey = 'profile' | 'security' | 'prefs' | 'danger';

@Component({
  selector: 'app-me',
  standalone: true,
  imports: [CommonModule, RouterModule, ReactiveFormsModule, TranslatePipe],
  templateUrl: './me.html',
  styleUrl: './me.scss',
})
export class MeComponent implements AfterViewInit, OnDestroy {
  apiBase = environment.apiBaseUrl;

  private reload$ = new BehaviorSubject<void>(undefined);
  state$: Observable<LoadState<ProfileDto>>;

  activeSection: SectionKey = 'profile';

  // ── Avatar ────────────────────────────────────
  private avatarBust = Date.now();
  avatarLiveSrc: string | null = null;
  private lastServerAvatarPath: string | null = null;
  private localAvatarObjectUrl: string | null = null;

  // ── Upload + crop ─────────────────────────────
  cropOpen = false;
  previewDataUrl: string | null = null;
  photoUploading = false;
  uploadPct = 0;

  @ViewChild('cropCanvas') cropCanvas?: ElementRef<HTMLCanvasElement>;
  zoom = 1.15;
  minZoom = 1;
  maxZoom = 2.5;

  private panPxX = 0;
  private panPxY = 0;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private imgEl: HTMLImageElement | null = null;

  private wrapSize = 320;
  private cropSize = 220;
  private outSize  = 512;

  // ── Profile fields ────────────────────────────
  displayName = '';
  nameWorking = false;
  nameError: string | null = null;

  // ── Password ──────────────────────────────────
  pwWorking = false;
  pwError: string | null = null;
  pwSuccess: string | null = null;
  showCurrent = false;
  showNew = false;

  // ── Delete ────────────────────────────────────
  deleteWorking = false;
  deleteError: string | null = null;

  pwForm;
  deleteForm;

  private subs = new Subscription();
  private scrollTicking = false;

  constructor(
    private profileApi: ProfileApi,
    private auth: Auth,
    private router: Router,
    private fb: FormBuilder,
    private confirm: ConfirmService,
    private toast: ToastService,
    private http: HttpClient,
    public lang: LanguageService   // public so template can use lang.isRtl / lang.current
  ) {
    this.state$ = this.reload$.pipe(
      switchMap(() =>
        this.profileApi.getProfile().pipe(
          tap((p) => {
            this.displayName = p?.displayName || '';
            this.lastServerAvatarPath = p?.profileImageUrl || null;
            if (!this.avatarLiveSrc) {
              this.avatarLiveSrc = this.buildServerAvatarUrl(this.lastServerAvatarPath);
            }
          }),
          map((p) => ({ loading: false, data: p, error: null } as LoadState<ProfileDto>)),
          startWith({ loading: true, data: null, error: null } as LoadState<ProfileDto>),
          catchError((err) =>
            of({
              loading: false,
              data: null,
              error: `Failed to load profile: ${err?.status ?? ''} ${err?.statusText ?? ''}`.trim(),
            } as LoadState<ProfileDto>)
          )
        )
      ),
      shareReplay(1)
    );

    this.pwForm = this.fb.group({
      currentPassword: ['', [Validators.required, Validators.minLength(6)]],
      newPassword:     ['', [Validators.required, Validators.minLength(6)]],
    });

    this.deleteForm = this.fb.group({
      password: ['', [Validators.required, Validators.minLength(6)]],
    });
  }

  ngAfterViewInit(): void {
    if (this.cropOpen) queueMicrotask(() => this.drawCropCanvas());
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    this.revokeLocalAvatarUrl();
  }

  reload() { this.reload$.next(); }

  firstLetter(email?: string | null) {
    return ((email || 'U').trim()[0] || 'U').toUpperCase();
  }

  private buildServerAvatarUrl(url?: string | null): string | null {
    if (!url) return null;
    return `${this.apiBase}${url}?v=${this.avatarBust}`;
  }

  displayPhone(phone?: string | null): string {
    return (phone || '').trim() || this.lang.label('notSet');
  }

  toggleCurrent() { this.showCurrent = !this.showCurrent; }
  toggleNew()     { this.showNew = !this.showNew; }

  // ── Language ──────────────────────────────────

  onLangChange(v: string) {
    this.lang.set(v as AppLang);
    const msg = v === 'ar' ? 'تم تغيير اللغة إلى العربية' : 'Language changed to English';
    this.toast.success(msg);
  }

  // ── Section nav ───────────────────────────────

  goTo(section: SectionKey) {
    this.activeSection = section;
    const el = document.getElementById(`sec-${section}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  @HostListener('window:scroll')
  onScroll() {
    if (this.scrollTicking) return;
    this.scrollTicking = true;
    requestAnimationFrame(() => {
      this.scrollTicking = false;
      const keys: SectionKey[] = ['profile', 'security', 'prefs', 'danger'];
      let best: { key: SectionKey; top: number } | null = null;
      for (const k of keys) {
        const el = document.getElementById(`sec-${k}`);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (r.top <= 130 && (!best || r.top > best.top))
          best = { key: k, top: r.top };
      }
      if (best) this.activeSection = best.key;
    });
  }

  // ── Photo crop/upload ─────────────────────────

  onPhotoSelected(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      this.toast.error('Please select JPG, PNG, or WEBP.');
      input.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      this.toast.error('Max file size is 5MB.');
      input.value = '';
      return;
    }

    input.value = '';
    const reader = new FileReader();
    reader.onload = async () => {
      this.previewDataUrl = String(reader.result || '');
      this.cropOpen = true;
      try {
        await this.loadImageForCrop(this.previewDataUrl);
        this.resetCrop();
        setTimeout(() => this.drawCropCanvas(), 0);
      } catch {
        this.toast.error('Image failed to load.');
        this.cancelCrop();
      }
    };
    reader.readAsDataURL(file);
  }

  cancelCrop() {
    this.cropOpen = false;
    this.previewDataUrl = null;
    this.imgEl = null;
    this.dragging = false;
    this.photoUploading = false;
    this.uploadPct = 0;
    this.revokeLocalAvatarUrl();
    this.avatarBust = Date.now();
    this.avatarLiveSrc = this.buildServerAvatarUrl(this.lastServerAvatarPath);
  }

  private loadImageForCrop(dataUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload  = () => { this.imgEl = img; resolve(); };
      img.onerror = () => reject(new Error('Image failed to load'));
      img.src = dataUrl;
    });
  }

  private resetCrop() {
    this.zoom   = 1.15;
    this.panPxX = 0;
    this.panPxY = 0;
  }

  onZoomInput(v: string) {
    const z = Number(v);
    this.zoom = isFinite(z) ? Math.min(this.maxZoom, Math.max(this.minZoom, z)) : 1.15;
    this.drawCropCanvas();
  }

  onCropPointerDown(ev: PointerEvent) {
    if (!this.cropOpen) return;
    this.dragging = true;
    this.lastX = ev.clientX;
    this.lastY = ev.clientY;
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
  }

  onCropPointerMove(ev: PointerEvent) {
    if (!this.dragging || !this.cropOpen) return;
    const dx = ev.clientX - this.lastX;
    const dy = ev.clientY - this.lastY;
    this.lastX = ev.clientX;
    this.lastY = ev.clientY;
    this.panPxX += dx;
    this.panPxY += dy;
    this.drawCropCanvas();
  }

  onCropPointerUp() { this.dragging = false; }

  private drawCropCanvas() {
    const canvas = this.cropCanvas?.nativeElement;
    const img = this.imgEl;
    if (!canvas || !img) return;

    const size = this.wrapSize;
    const dpr  = window.devicePixelRatio || 1;

    canvas.width  = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    canvas.style.width  = `${size}px`;
    canvas.style.height = `${size}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    const iw = img.naturalWidth  || img.width;
    const ih = img.naturalHeight || img.height;

    const baseScale = Math.max(size / iw, size / ih);
    const scale = baseScale * this.zoom;
    const dw = iw * scale;
    const dh = ih * scale;
    const cx = size / 2 + this.panPxX;
    const cy = size / 2 + this.panPxY;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);

    const crop  = this.cropSize;
    const cropX = (size - crop) / 2;
    const cropY = (size - crop) / 2;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.rect(0, 0, size, size);
    ctx.rect(cropX, cropY, crop, crop);
    ctx.fill('evenodd');
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.strokeRect(cropX + 1, cropY + 1, crop - 2, crop - 2);
    ctx.restore();
  }

  confirmCropAndUpload() { this.uploadPhotoNow(); }

  private async uploadPhotoNow() {
    if (this.photoUploading || !this.imgEl) return;
    try {
      const blob = await this.renderCroppedBlob(this.imgEl);
      this.revokeLocalAvatarUrl();
      this.localAvatarObjectUrl = URL.createObjectURL(blob);
      this.avatarLiveSrc = this.localAvatarObjectUrl;
      await this.uploadBlobWithProgress(blob);
      this.cropOpen = false;
      this.previewDataUrl = null;
      this.imgEl = null;
      this.toast.success(this.lang.label('savePhoto'));
    } catch {
      this.toast.error('Upload failed.');
      this.revokeLocalAvatarUrl();
      this.avatarBust = Date.now();
      this.avatarLiveSrc = this.buildServerAvatarUrl(this.lastServerAvatarPath);
    }
  }

  private renderCroppedBlob(img: HTMLImageElement): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const out = document.createElement('canvas');
      out.width  = this.outSize;
      out.height = this.outSize;
      const ctx = out.getContext('2d');
      if (!ctx) return reject(new Error('No canvas ctx'));

      const iw = img.naturalWidth  || img.width;
      const ih = img.naturalHeight || img.height;

      const size   = this.wrapSize;
      const crop   = this.cropSize;
      const cropX  = (size - crop) / 2;
      const cropY  = (size - crop) / 2;
      const baseScale = Math.max(size / iw, size / ih);
      const scale  = baseScale * this.zoom;
      const dw     = iw * scale;
      const dh     = ih * scale;
      const cx     = size / 2 + this.panPxX;
      const cy     = size / 2 + this.panPxY;
      const dx     = cx - dw / 2;
      const dy     = cy - dh / 2;
      const sx     = (cropX - dx) / scale;
      const sy     = (cropY - dy) / scale;
      const sSize  = crop / scale;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(
        img,
        Math.max(0, Math.min(iw - sSize, sx)),
        Math.max(0, Math.min(ih - sSize, sy)),
        sSize, sSize,
        0, 0, this.outSize, this.outSize
      );

      out.toBlob((b) => {
        if (!b) return reject(new Error('toBlob failed'));
        resolve(b);
      }, 'image/webp', 0.92);
    });
  }

  private uploadBlobWithProgress(blob: Blob): Promise<void> {
    return new Promise((resolve, reject) => {
      const form = new FormData();
      form.append('file', new File([blob], 'avatar.webp', { type: 'image/webp' }));
      this.photoUploading = true;
      this.uploadPct = 0;

      this.http.post<any>(`${this.apiBase}/api/profile/photo`, form, {
        reportProgress: true, observe: 'events'
      }).subscribe({
        next: (ev: HttpEvent<any>) => {
          if (ev.type === HttpEventType.UploadProgress)
            this.uploadPct = Math.round((100 * ev.loaded) / (ev.total ?? 1));

          if (ev.type === HttpEventType.Response) {
            this.photoUploading = false;
            this.uploadPct = 100;
            const profileImageUrl = (ev.body?.profileImageUrl as string | null) ?? null;
            this.lastServerAvatarPath = profileImageUrl;
            this.revokeLocalAvatarUrl();
            this.avatarBust = Date.now();
            this.avatarLiveSrc = this.buildServerAvatarUrl(profileImageUrl);
            this.reload();
            resolve();
          }
        },
        error: () => { this.photoUploading = false; this.uploadPct = 0; reject(new Error('Upload failed')); }
      });
    });
  }

  private revokeLocalAvatarUrl() {
    if (this.localAvatarObjectUrl) {
      URL.revokeObjectURL(this.localAvatarObjectUrl);
      this.localAvatarObjectUrl = null;
    }
  }

  // ── Name ──────────────────────────────────────

  saveName() {
    this.nameError = null;
    this.nameWorking = true;
    this.profileApi.updateProfile((this.displayName || '').trim() || null).subscribe({
      next: () => {
        this.nameWorking = false;
        this.toast.success(this.lang.label('save') + ' ✓');
        this.reload();
      },
      error: (err) => {
        this.nameWorking = false;
        this.nameError = typeof err?.error === 'string' ? err.error : 'Failed to update profile.';
        this.toast.error(this.nameError ?? '');
      }
    });
  }

  // ── Password ──────────────────────────────────

  async changePassword() {
    this.pwError = null;
    this.pwSuccess = null;
    if (this.pwForm.invalid) { this.pwForm.markAllAsTouched(); return; }

    const { currentPassword, newPassword } = this.pwForm.value;
    const isAr = this.lang.isRtl;

    const ok = await this.confirm.open({
      title:       isAr ? 'تغيير كلمة المرور؟'          : 'Change password?',
      message:     isAr ? 'ستسجّل الدخول مجددًا بعد التغيير.' : 'You will be logged out and must sign in again.',
      confirmText: isAr ? 'نعم، غيّرها'                 : 'Yes, change it',
      cancelText:  isAr ? 'إلغاء'                       : 'Cancel',
    });

    if (!ok) return;
    this.pwWorking = true;

    this.profileApi.changePassword(currentPassword!, newPassword!).subscribe({
      next: (res) => {
        this.pwWorking = false;
        const msg = res?.message || (isAr ? 'تم التحديث.' : 'Password updated. Please sign in again.');
        this.pwSuccess = msg;
        sessionStorage.setItem('login_notice', msg);
        this.auth.logout();
        this.router.navigateByUrl('/login');
      },
      error: (err) => {
        this.pwWorking = false;
        this.pwError = typeof err?.error === 'string' ? err.error : (err?.error?.message || 'Change password failed.');
        this.toast.error(this.pwError ?? '');
      }
    });
  }

  // ── Delete ────────────────────────────────────

  async deleteAccount() {
    this.deleteError = null;
    if (this.deleteForm.invalid) { this.deleteForm.markAllAsTouched(); return; }

    const isAr = this.lang.isRtl;
    const ok = await this.confirm.open({
      title:       isAr ? 'حذف الحساب؟'                        : 'Delete account?',
      message:     isAr ? 'سيؤدي هذا إلى حذف حسابك بشكل دائم.' : 'This will permanently delete your account. This cannot be undone.',
      confirmText: isAr ? 'نعم، احذف'                          : 'Yes, delete',
      cancelText:  isAr ? 'إلغاء'                              : 'Cancel',
    });

    if (!ok) return;
    this.deleteWorking = true;

    this.profileApi.deleteAccount(this.deleteForm.value.password!).subscribe({
      next: (res) => {
        this.deleteWorking = false;
        this.toast.success(res?.message || (isAr ? 'تم حذف الحساب.' : 'Account deleted.'));
        this.auth.logout();
        this.router.navigateByUrl('/login');
      },
      error: (err) => {
        this.deleteWorking = false;
        this.deleteError = typeof err?.error === 'string' ? err.error : 'Delete failed.';
        this.toast.error(this.deleteError ?? '');
      }
    });
  }

  // ── Logout ────────────────────────────────────

  logout() {
    sessionStorage.removeItem('login_notice');
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }
}