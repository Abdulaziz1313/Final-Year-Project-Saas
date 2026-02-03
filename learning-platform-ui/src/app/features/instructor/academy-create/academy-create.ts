import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { InstructorApi } from '../../../core/services/instructor-api';
import { environment } from '../../../../environments/environment';

function slugify(input: string): string {
  return (input || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function ensureHttp(value?: string | null): string {
  const v = (value || '').trim();
  if (!v) return '';
  if (/^https?:\/\//i.test(v)) return v;
  return `https://${v}`;
}

function isValidHttpUrl(value?: string | null): boolean {
  const v = (value || '').trim();
  if (!v) return true;
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

type SectionKey = 'details' | 'color' | 'font';
type SectionState = SectionKey | null;

@Component({
  selector: 'app-academy-create',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './academy-create.html',
  styleUrl: './academy-create.scss',
})
export class AcademyCreateComponent {
  loading = false;
  error: string | null = null;

  logoPreview: string | null = null;
  logoFile: File | null = null;

  bannerPreview: string | null = null;
  bannerFile: File | null = null;

  // Preview base
  primaryColor = '#7c3aed';
  apiBase = environment.apiBaseUrl;

  activeSection: SectionState = 'details';
  private slugLocked = false;

  copied = false;

  // Draft/Publish UI (front-end only for now)
  published = false;

  readonly descMax = 180;

  readonly fontPresets: Array<{ key: string; label: string; css: string; note?: string }> = [
    { key: 'system', label: 'System (Default)', css: `system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif` },
    { key: 'inter', label: 'Inter', css: `Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`, note: 'If installed' },
    { key: 'poppins', label: 'Poppins', css: `Poppins, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`, note: 'If installed' },
    { key: 'cairo', label: 'Cairo (Arabic)', css: `Cairo, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`, note: 'If installed' },
    { key: 'tajawal', label: 'Tajawal (Arabic)', css: `Tajawal, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`, note: 'If installed' },
    { key: 'ibmplexar', label: 'IBM Plex Sans Arabic', css: `"IBM Plex Sans Arabic", system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`, note: 'If installed' },
    { key: 'custom', label: 'Custom upload…', css: `var(--alef-custom-font, system-ui), system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif` },
  ];

  customFontFile: File | null = null;
  customFontName = 'AlefCustomFont';
  private customFontObjectUrl: string | null = null;

  form;

  constructor(private fb: FormBuilder, private api: InstructorApi, private router: Router) {
    this.form = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3)]],
      slug: ['', [Validators.required, Validators.minLength(3)]],
      description: ['', [Validators.maxLength(this.descMax)]],
      website: [''],
      primaryColor: [this.primaryColor],
      fontKey: ['system'],
    });

    // auto-slug until user edits
    this.form.get('name')!.valueChanges.subscribe((v) => {
      if (this.slugLocked) return;
      this.form.get('slug')!.setValue(slugify(v || ''), { emitEvent: false });
    });

    // lock slug when customized
    this.form.get('slug')!.valueChanges.subscribe((v) => {
      const name = this.form.get('name')!.value || '';
      const auto = slugify(name);
      const current = (v || '').trim();
      if (!current) {
        this.slugLocked = false;
        return;
      }
      if (current !== auto) this.slugLocked = true;
    });

    // update preview color
    this.form.get('primaryColor')!.valueChanges.subscribe((v) => {
      this.primaryColor = v || '#7c3aed';
    });
  }

  // --- accordion fix ---
  openSection(key: SectionKey) {
    this.activeSection = this.activeSection === key ? null : key;
  }
  isOpen(key: SectionKey) {
    return this.activeSection === key;
  }

  // --- draft/publish ---
  setPublished(v: boolean) {
    this.published = v;
  }
  togglePublished() {
    this.published = !this.published;
  }

  // --- form controls ---
  get nameCtrl() { return this.form.get('name'); }
  get slugCtrl() { return this.form.get('slug'); }
  get websiteCtrl() { return this.form.get('website'); }
  get descCtrl() { return this.form.get('description'); }

  get descriptionCount(): number {
    return (this.form.value.description || '').length;
  }

  get isWebsiteValid(): boolean {
    return isValidHttpUrl(this.form.value.website);
  }

  get academyUrlPreview(): string {
    const slug = (this.form.value.slug || 'your-slug').trim() || 'your-slug';
    return `/#/academy/${slug}`;
  }

  get previewFontFamily(): string {
    const key = this.form.value.fontKey || 'system';
    const found = this.fontPresets.find(f => f.key === key) || this.fontPresets[0];
    if (key === 'custom' && !this.customFontFile) return this.fontPresets[0].css;
    return found.css;
  }

  get canSubmit(): boolean {
    if (this.loading) return false;
    if (!this.isWebsiteValid) return false;
    return this.form.valid;
  }

  // --- slug helpers ---
  onSlugInput() {
    this.slugLocked = true;
  }

  onSlugBlur() {
    const raw = this.form.value.slug || '';
    const cleaned = slugify(raw);
    this.form.get('slug')!.setValue(cleaned, { emitEvent: false });

    const name = this.form.value.name || '';
    if (cleaned === slugify(name)) this.slugLocked = false;
  }

  resetSlugToAuto() {
    const name = this.form.value.name || '';
    this.slugLocked = false;
    this.form.get('slug')!.setValue(slugify(name), { emitEvent: false });
  }

  normalizeWebsiteOnBlur() {
    const v = this.form.value.website || '';
    if (!v.trim()) return;
    this.form.get('website')!.setValue(ensureHttp(v), { emitEvent: false });
  }

  async copyPreviewUrl() {
    try {
      await navigator.clipboard.writeText(this.academyUrlPreview);
      this.copied = true;
      setTimeout(() => (this.copied = false), 1200);
    } catch {
      this.copied = false;
    }
  }

  // --- reset branding ---
  resetBranding() {
    const ok = confirm('Reset branding to defaults? This will clear logo, banner, and custom font selection.');
    if (!ok) return;

    // reset form styling fields
    this.form.patchValue({
      primaryColor: '#7c3aed',
      fontKey: 'system',
    }, { emitEvent: true });

    // clear uploads
    this.removeLogo();
    this.removeBanner();
    this.removeCustomFont(false);

    // reset publish to draft (optional, feels natural on reset)
    this.published = false;
  }

  // --- logo ---
  onLogoSelected(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.acceptLogoFile(file, () => (input.value = ''));
  }

  onDropLogo(ev: DragEvent) {
    ev.preventDefault();
    const file = ev.dataTransfer?.files?.[0];
    if (!file) return;
    this.acceptLogoFile(file);
  }

  onDragOver(ev: DragEvent) {
    ev.preventDefault();
  }

  removeLogo() {
    this.logoFile = null;
    this.logoPreview = null;
  }

  private acceptLogoFile(file: File, onReject?: () => void) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      alert('Please select JPG/PNG/WEBP');
      onReject?.();
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('Max 5MB');
      onReject?.();
      return;
    }
    this.logoFile = file;

    const reader = new FileReader();
    reader.onload = () => (this.logoPreview = String(reader.result));
    reader.readAsDataURL(file);
  }

  // --- banner ---
  onBannerSelected(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      alert('Please select JPG/PNG/WEBP');
      input.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('Max 5MB');
      input.value = '';
      return;
    }

    this.bannerFile = file;

    const reader = new FileReader();
    reader.onload = () => (this.bannerPreview = String(reader.result));
    reader.readAsDataURL(file);
  }

  removeBanner() {
    this.bannerFile = null;
    this.bannerPreview = null;
  }

  // --- font upload (preview runtime) ---
  onFontSelected(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.acceptFontFile(file, () => (input.value = ''));
  }

  removeCustomFont(setSystem = true) {
    this.customFontFile = null;
    this.clearCustomFontStyle();
    if (setSystem) this.form.get('fontKey')!.setValue('system', { emitEvent: true });
  }

  private acceptFontFile(file: File, onReject?: () => void) {
    const extOk = /\.(ttf|otf|woff|woff2)$/i.test(file.name);
    if (!extOk) {
      alert('Please upload a font file: .woff2 / .woff / .ttf / .otf');
      onReject?.();
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert('Max 10MB for font file');
      onReject?.();
      return;
    }

    this.customFontFile = file;
    this.applyCustomFont(file);
    this.form.get('fontKey')!.setValue('custom', { emitEvent: true });
  }

  private applyCustomFont(file: File) {
    this.clearCustomFontStyle();

    this.customFontObjectUrl = URL.createObjectURL(file);

    const format =
      file.name.toLowerCase().endsWith('.woff2') ? 'woff2' :
      file.name.toLowerCase().endsWith('.woff') ? 'woff' :
      file.name.toLowerCase().endsWith('.otf') ? 'opentype' :
      'truetype';

    const css = `
@font-face {
  font-family: '${this.customFontName}';
  src: url('${this.customFontObjectUrl}') format('${format}');
  font-display: swap;
}
:root { --alef-custom-font: '${this.customFontName}'; }
`;

    const style = document.createElement('style');
    style.id = 'alef-custom-font-style';
    style.textContent = css;
    document.head.appendChild(style);
  }

  private clearCustomFontStyle() {
    const style = document.getElementById('alef-custom-font-style');
    if (style) style.remove();

    if (this.customFontObjectUrl) {
      URL.revokeObjectURL(this.customFontObjectUrl);
      this.customFontObjectUrl = null;
    }
  }

  // --- submit ---
  async submit() {
    this.error = null;

    if (!this.isWebsiteValid) {
      this.websiteCtrl?.markAsTouched();
      this.error = 'Please enter a valid website URL (https://...)';
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading = true;

    const v = this.form.value;
    const fontKey = (v.fontKey as any) ?? 'system';

    this.api.createAcademy({
      name: (v.name || '').trim(),
      slug: (v.slug || '').trim(),
      description: (v.description || '').trim(),
      website: (v.website || '').trim(),
      primaryColor: v.primaryColor ?? '#7c3aed',
      fontKey,
      isPublished: this.published
    }).subscribe({
      next: (res) => {
        const academyId = res.id;

        const finish = () => {
          this.loading = false;
          this.router.navigateByUrl('/instructor');
        };

        const doBanner = () => {
          if (!this.bannerFile) return finish();
          // requires InstructorApi.uploadAcademyBanner
          this.api.uploadAcademyBanner(academyId, this.bannerFile).subscribe({
            next: () => finish(),
            error: () => finish()
          });
        };

        const doLogo = () => {
          if (!this.logoFile) return doBanner();
          this.api.uploadAcademyLogo(academyId, this.logoFile).subscribe({
            next: () => doBanner(),
            error: () => doBanner()
          });
        };

        // if custom font uploaded, upload it first
        if (fontKey === 'custom' && this.customFontFile) {
          this.api.uploadAcademyFont(academyId, this.customFontFile).subscribe({
            next: () => doLogo(),
            error: () => doLogo()
          });
          return;
        }

        // persist preset font selection (safe)
        if (fontKey && fontKey !== 'custom') {
          this.api.updateAcademyBranding(academyId, { fontKey }).subscribe({
            next: () => doLogo(),
            error: () => doLogo()
          });
          return;
        }

        doLogo();
      },
      error: (err) => {
        this.loading = false;
        this.error = typeof err?.error === 'string' ? err.error : 'Failed to create academy';
      }
    });
  }
}
