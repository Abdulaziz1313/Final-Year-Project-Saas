import { Component, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { OrgApi } from '../../../core/services/org-api';

type StepKey = 'details' | 'branding' | 'review';
type ThemeMode = 'light' | 'warm' | 'dark';
type HeroLayout = 'split' | 'centered' | 'immersive';
type SurfaceStyle = 'soft' | 'outline' | 'glass';
type RadiusKey = 'rounded' | 'sharp';
type AccentStyle = 'solid' | 'gradient';

type ExampleCourse = {
  title: string;
  meta: string;
  level: string;
};

type BrandingPayload = {
  themeMode: ThemeMode;
  accentStyle: AccentStyle;
  tagline: string | null;
  category: string | null;
  contactEmail: string | null;
  supportLabel: string | null;
  welcomeTitle: string | null;
  ctaPrimaryText: string | null;
  ctaSecondaryText: string | null;
  navLabelPrimary: string | null;
  navLabelSecondary: string | null;
  footerText: string | null;
  showStats: boolean;
  showTestimonials: boolean;
};

type LayoutPayload = {
  heroLayout: HeroLayout;
  surfaceStyle: SurfaceStyle;
  radiusKey: RadiusKey;
};

type CreatedAcademy = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  website?: string | null;
  primaryColor?: string | null;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  fontKey?: string | null;

  themeMode?: ThemeMode;
  heroLayout?: HeroLayout;
  surfaceStyle?: SurfaceStyle;
  radiusKey?: RadiusKey;
  accentStyle?: AccentStyle;

  tagline?: string | null;
  category?: string | null;
  contactEmail?: string | null;
  supportLabel?: string | null;
  welcomeTitle?: string | null;
  ctaPrimaryText?: string | null;
  ctaSecondaryText?: string | null;
  navLabelPrimary?: string | null;
  navLabelSecondary?: string | null;
  footerText?: string | null;
  showStats?: boolean;
  showTestimonials?: boolean;

  brandingJson?: string | null;
  layoutJson?: string | null;
};

const FONTS: Record<string, { label: string; family: string; googleUrl: string | null }> = {
  system: {
    label: 'System (Default)',
    family: "'DM Sans', system-ui, sans-serif",
    googleUrl: null,
  },
  inter: {
    label: 'Inter',
    family: "'Inter', sans-serif",
    googleUrl: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  },
  poppins: {
    label: 'Poppins',
    family: "'Poppins', sans-serif",
    googleUrl: 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap',
  },
  cairo: {
    label: 'Cairo (Arabic)',
    family: "'Cairo', sans-serif",
    googleUrl: 'https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700&display=swap',
  },
  tajawal: {
    label: 'Tajawal (Arabic)',
    family: "'Tajawal', sans-serif",
    googleUrl: 'https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700&display=swap',
  },
  ibmplexar: {
    label: 'IBM Plex Sans Arabic',
    family: "'IBM Plex Sans Arabic', sans-serif",
    googleUrl: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;700&display=swap',
  },
};

@Component({
  selector: 'app-org-academy-create',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './org-academy-create.html',
  styleUrl: './org-academy-create.scss',
})
export class OrgAcademyCreateComponent implements OnDestroy {
  readonly fontOptions = Object.entries(FONTS).map(([key, value]) => ({
    key,
    label: value.label,
  }));

  name = '';
  description = '';
  website = '';
  primaryColor = '#7c3aed';

  private _fontKey = 'system';
  get fontKey(): string {
    return this._fontKey;
  }
  set fontKey(value: string) {
    this._fontKey = value || 'system';
    this.loadFont(this._fontKey);
  }

  tagline = '';
  category = 'General';
  contactEmail = '';
  supportLabel = 'Contact us';
  welcomeTitle = '';
  ctaPrimaryText = 'Browse courses';
  ctaSecondaryText = 'Contact';
  navLabelPrimary = 'Explore';
  navLabelSecondary = 'About';
  footerText = 'Links · Contact · Terms';

  themeMode: ThemeMode = 'light';
  heroLayout: HeroLayout = 'split';
  surfaceStyle: SurfaceStyle = 'soft';
  radiusKey: RadiusKey = 'rounded';
  accentStyle: AccentStyle = 'solid';

  showStats = true;
  showTestimonials = true;

  logoPreview: string | null = null;
  logoFile: File | null = null;
  bannerPreview: string | null = null;
  bannerFile: File | null = null;
  dragLogo = false;
  dragBanner = false;

  loading = false;
  error = '';
  created: CreatedAcademy | null = null;
  copied = false;

  step: StepKey = 'details';

  private injectedLinks = new Map<string, HTMLLinkElement>();

  readonly exampleCourses: ExampleCourse[] = [
    { title: 'Getting Started with Modern Learning', meta: '6 modules · beginner', level: 'Beginner' },
    { title: 'Professional Skills Accelerator', meta: '8 modules · practical', level: 'Popular' },
    { title: 'Arabic & Digital Confidence', meta: '12 lessons · mixed format', level: 'New' },
  ];

  constructor(
    private orgApi: OrgApi,
    private router: Router
  ) {
    this.loadFont(this._fontKey);
  }

  ngOnDestroy(): void {
    this.injectedLinks.forEach((link) => link.remove());
    this.injectedLinks.clear();
  }

  private loadFont(key: string): void {
    const font = FONTS[key];
    if (!font?.googleUrl) return;
    if (this.injectedLinks.has(key)) return;

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = font.googleUrl;
    document.head.appendChild(link);
    this.injectedLinks.set(key, link);
  }

  get academySlugPreview(): string {
    const raw = (this.name || 'your-academy').trim().toLowerCase();
    return (
      raw
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || 'your-academy'
    );
  }

  get displayNamePreview(): string {
    return this.name.trim() || 'Academy Name';
  }

  get primaryGradient(): string {
    const dark = this.shadeHex(this.primaryColor, -18);
    return `linear-gradient(135deg, ${this.primaryColor} 0%, ${dark} 100%)`;
  }

  get fontFamilyPreview(): string {
    return FONTS[this._fontKey]?.family ?? FONTS['system'].family;
  }

  get currentFontLabel(): string {
    return FONTS[this._fontKey]?.label ?? 'System';
  }

  get previewClasses(): string[] {
    return [
      `theme-${this.themeMode}`,
      `hero-${this.heroLayout}`,
      `surface-${this.surfaceStyle}`,
      `radius-${this.radiusKey}`,
      `accent-${this.accentStyle}`,
    ];
  }

  get academyPublicLink(): string {
    return this.created
      ? `${window.location.origin}/#/academy-home/${encodeURIComponent(this.created.slug)}`
      : '';
  }

  get instructorLoginLink(): string {
    return this.created
      ? `${window.location.origin}/#/login-instructor?academy=${encodeURIComponent(this.created.slug)}`
      : '';
  }

  get studentLoginLink(): string {
    return this.created
      ? `${window.location.origin}/#/login-academy?academy=${encodeURIComponent(this.created.slug)}`
      : '';
  }

  get studentSignupLink(): string {
    return this.created
      ? `${window.location.origin}/#/register-student?academy=${encodeURIComponent(this.created.slug)}`
      : '';
  }

  goStep(step: StepKey): void {
    if ((step === 'branding' || step === 'review') && !this.name.trim()) {
      this.error = 'Academy name is required.';
      return;
    }

    this.error = '';
    this.step = step;
    queueMicrotask(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  prevStep(): void {
    const order: StepKey[] = ['details', 'branding', 'review'];
    const index = order.indexOf(this.step);
    this.step = order[Math.max(0, index - 1)];
    this.error = '';
    queueMicrotask(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  nextStep(): void {
    if (this.step === 'details' && !this.name.trim()) {
      this.error = 'Academy name is required.';
      return;
    }

    if (this.step === 'details' && this.contactEmail.trim() && !this.isValidEmail(this.contactEmail.trim())) {
      this.error = 'Please enter a valid support email.';
      return;
    }

    if (this.step === 'details' && this.website.trim() && !this.isValidUrl(this.website.trim())) {
      this.error = 'Please enter a valid website URL starting with http:// or https://';
      return;
    }

    this.error = '';

    const order: StepKey[] = ['details', 'branding', 'review'];
    const index = order.indexOf(this.step);
    this.step = order[Math.min(order.length - 1, index + 1)];
    queueMicrotask(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  isStepDone(step: StepKey): boolean {
    if (step === 'details') return this.step === 'branding' || this.step === 'review';
    if (step === 'branding') return this.step === 'review';
    return false;
  }

  onDragOver(ev: DragEvent): void {
    ev.preventDefault();
  }

  onLogoSelected(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.acceptImageFile(file, 'logo', () => {
      input.value = '';
    });
  }

  onDropLogo(ev: DragEvent): void {
    ev.preventDefault();
    this.dragLogo = false;
    const file = ev.dataTransfer?.files?.[0];
    if (file) this.acceptImageFile(file, 'logo');
  }

  removeLogo(): void {
    this.logoFile = null;
    this.logoPreview = null;
    this.dragLogo = false;
    this.error = '';
  }

  onBannerSelected(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.acceptImageFile(file, 'banner', () => {
      input.value = '';
    });
  }

  onDropBanner(ev: DragEvent): void {
    ev.preventDefault();
    this.dragBanner = false;
    const file = ev.dataTransfer?.files?.[0];
    if (file) this.acceptImageFile(file, 'banner');
  }

  removeBanner(): void {
    this.bannerFile = null;
    this.bannerPreview = null;
    this.dragBanner = false;
    this.error = '';
  }

  private acceptImageFile(file: File, type: 'logo' | 'banner', onReject?: () => void): void {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];

    if (!allowed.includes(file.type)) {
      this.error = 'Please select JPG, PNG, or WEBP.';
      onReject?.();
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      this.error = 'Image must be 5 MB or smaller.';
      onReject?.();
      return;
    }

    this.error = '';

    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      if (!result) return;

      if (type === 'logo') {
        this.logoFile = file;
        this.logoPreview = result;
      } else {
        this.bannerFile = file;
        this.bannerPreview = result;
      }
    };

    reader.onerror = () => {
      this.error = 'Could not read the selected image.';
      onReject?.();
    };

    reader.readAsDataURL(file);
  }

  submit(): void {
    this.error = '';

    if (!this.name.trim()) {
      this.error = 'Name is required.';
      this.step = 'details';
      return;
    }

    if (this.contactEmail.trim() && !this.isValidEmail(this.contactEmail.trim())) {
      this.error = 'Please enter a valid support email.';
      this.step = 'details';
      return;
    }

    if (this.website.trim() && !this.isValidUrl(this.website.trim())) {
      this.error = 'Please enter a valid website URL starting with http:// or https://';
      this.step = 'details';
      return;
    }

    this.loading = true;
    this.copied = false;

    const branding = this.buildBrandingPayload();
    const layout = this.buildLayoutPayload();

    this.orgApi.createAcademy({
      name: this.name.trim(),
      description: this.toOptionalString(this.description),
      website: this.toOptionalString(this.website),
      primaryColor: this.primaryColor,
      fontKey: this._fontKey,

      themeMode: this.themeMode,
      heroLayout: this.heroLayout,
      surfaceStyle: this.surfaceStyle,
      radiusKey: this.radiusKey,
      accentStyle: this.accentStyle,

      tagline: this.toOptionalString(branding.tagline),
      category: this.toOptionalString(branding.category),
      contactEmail: this.toOptionalString(branding.contactEmail),
      supportLabel: this.toOptionalString(branding.supportLabel),
      welcomeTitle: this.toOptionalString(branding.welcomeTitle),
      ctaPrimaryText: this.toOptionalString(branding.ctaPrimaryText),
      ctaSecondaryText: this.toOptionalString(branding.ctaSecondaryText),
      navLabelPrimary: this.toOptionalString(branding.navLabelPrimary),
      navLabelSecondary: this.toOptionalString(branding.navLabelSecondary),
      footerText: this.toOptionalString(branding.footerText),
      showStats: branding.showStats,
      showTestimonials: branding.showTestimonials,

      brandingJson: JSON.stringify(branding),
      layoutJson: JSON.stringify(layout),
    }).subscribe({
      next: (res: any) => {
        const academyId = res?.id as string | undefined;

        if (!academyId) {
          this.loading = false;
          this.error = 'Academy created response was missing the academy id.';
          return;
        }

        const createdResult: CreatedAcademy = {
          id: academyId,
          name: res?.name ?? this.name.trim(),
          slug: res?.slug ?? this.academySlugPreview,
          description: res?.description ?? this.toNullable(this.description),
          website: res?.website ?? this.toNullable(this.website),
          primaryColor: res?.primaryColor ?? this.primaryColor,
          logoUrl: res?.logoUrl ?? null,
          bannerUrl: res?.bannerUrl ?? null,
          fontKey: res?.fontKey ?? this._fontKey,

          themeMode: res?.themeMode ?? this.themeMode,
          heroLayout: res?.heroLayout ?? this.heroLayout,
          surfaceStyle: res?.surfaceStyle ?? this.surfaceStyle,
          radiusKey: res?.radiusKey ?? this.radiusKey,
          accentStyle: res?.accentStyle ?? this.accentStyle,

          tagline: res?.tagline ?? branding.tagline,
          category: res?.category ?? branding.category,
          contactEmail: res?.contactEmail ?? branding.contactEmail,
          supportLabel: res?.supportLabel ?? branding.supportLabel,
          welcomeTitle: res?.welcomeTitle ?? branding.welcomeTitle,
          ctaPrimaryText: res?.ctaPrimaryText ?? branding.ctaPrimaryText,
          ctaSecondaryText: res?.ctaSecondaryText ?? branding.ctaSecondaryText,
          navLabelPrimary: res?.navLabelPrimary ?? branding.navLabelPrimary,
          navLabelSecondary: res?.navLabelSecondary ?? branding.navLabelSecondary,
          footerText: res?.footerText ?? branding.footerText,
          showStats: typeof res?.showStats === 'boolean' ? res.showStats : branding.showStats,
          showTestimonials: typeof res?.showTestimonials === 'boolean' ? res.showTestimonials : branding.showTestimonials,

          brandingJson: res?.brandingJson ?? JSON.stringify(branding),
          layoutJson: res?.layoutJson ?? JSON.stringify(layout),
        };

        const finish = () => {
          this.loading = false;
          this.created = createdResult;
          this.error = '';
        };

        const doBanner = () => {
          if (!this.bannerFile) {
            finish();
            return;
          }

          this.orgApi.uploadAcademyBanner(academyId, this.bannerFile).subscribe({
            next: (bannerRes: any) => {
              createdResult.bannerUrl = bannerRes?.bannerUrl ?? bannerRes?.url ?? createdResult.bannerUrl ?? null;
              finish();
            },
            error: () => finish(),
          });
        };

        const doLogo = () => {
          if (!this.logoFile) {
            doBanner();
            return;
          }

          this.orgApi.uploadAcademyLogo(academyId, this.logoFile).subscribe({
            next: (logoRes: any) => {
              createdResult.logoUrl = logoRes?.logoUrl ?? logoRes?.url ?? createdResult.logoUrl ?? null;
              doBanner();
            },
            error: () => doBanner(),
          });
        };

        doLogo();
      },
      error: (err: any) => {
        this.loading = false;
        this.error =
          err?.error?.message ||
          (typeof err?.error === 'string' ? err.error : null) ||
          'Failed to create academy.';
      },
    });
  }

  copyLink(): void {
    if (!this.academyPublicLink) return;

    navigator.clipboard.writeText(this.academyPublicLink).then(() => {
      this.copied = true;
      setTimeout(() => {
        this.copied = false;
      }, 2000);
    }).catch(() => {
      this.error = 'Could not copy the academy link.';
    });
  }

  done(): void {
    this.router.navigateByUrl('/org/academies');
  }

  private buildBrandingPayload(): BrandingPayload {
    return {
      themeMode: this.themeMode,
      accentStyle: this.accentStyle,
      tagline: this.toNullable(this.tagline),
      category: this.toNullable(this.category),
      contactEmail: this.toNullable(this.contactEmail),
      supportLabel: this.toNullable(this.supportLabel),
      welcomeTitle: this.toNullable(this.welcomeTitle),
      ctaPrimaryText: this.toNullable(this.ctaPrimaryText),
      ctaSecondaryText: this.toNullable(this.ctaSecondaryText),
      navLabelPrimary: this.toNullable(this.navLabelPrimary),
      navLabelSecondary: this.toNullable(this.navLabelSecondary),
      footerText: this.toNullable(this.footerText),
      showStats: this.showStats,
      showTestimonials: this.showTestimonials,
    };
  }

  private buildLayoutPayload(): LayoutPayload {
    return {
      heroLayout: this.heroLayout,
      surfaceStyle: this.surfaceStyle,
      radiusKey: this.radiusKey,
    };
  }

  private toNullable(value: string | null | undefined): string | null {
    const v = (value ?? '').trim();
    return v ? v : null;
  }

  private toOptionalString(value: string | null | undefined): string | undefined {
    const v = (value ?? '').trim();
    return v ? v : undefined;
  }

  private isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  private isValidUrl(value: string): boolean {
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  private shadeHex(hex: string, percent: number): string {
    const normalized = (hex || '').replace('#', '').trim();
    if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return '#5b21b6';

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