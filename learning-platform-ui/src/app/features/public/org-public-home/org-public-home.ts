import { Component, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { Auth, AcademyPublicInfo } from '../../../core/services/auth';
import { StudentApi } from '../../../core/services/student-api';
import { environment } from '../../../../environments/environment';

export interface AcademyCoursePreview {
  id: string;
  title: string;
  shortDescription?: string | null;
  thumbnailUrl?: string | null;
  category?: string | null;
  isFree: boolean;
  price?: number | null;
  currency?: string | null;
  modulesCount?: number | null;
  lessonsCount?: number | null;
}

type ThemeMode = 'light' | 'warm' | 'dark';
type HeroLayout = 'split' | 'centered' | 'immersive';
type SurfaceStyle = 'soft' | 'outline' | 'glass';
type RadiusKey = 'rounded' | 'sharp';
type AccentStyle = 'solid' | 'gradient';

type BrandingData = {
  themeMode?: ThemeMode | null;
  accentStyle?: AccentStyle | null;
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
  showStats?: boolean | null;
  showTestimonials?: boolean | null;
};

type LayoutData = {
  heroLayout?: HeroLayout | null;
  surfaceStyle?: SurfaceStyle | null;
  radiusKey?: RadiusKey | null;
};

type AcademyPublicInfoExtended = AcademyPublicInfo & {
  brandingJson?: string | null;
  layoutJson?: string | null;
  fontKey?: string | null;
  website?: string | null;
  orgName?: string | null;
};

@Component({
  selector: 'app-org-public-home',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './org-public-home.html',
  styleUrl: './org-public-home.scss',
})
export class OrgPublicHomeComponent implements OnInit {
  year = new Date().getFullYear();

  slug = '';
  loading = true;
  error = '';
  academy: AcademyPublicInfoExtended | null = null;

  previewCourses: AcademyCoursePreview[] = [];
  coursesLoading = false;

  signInOpen = false;
  readonly api = environment.apiBaseUrl;

  branding: BrandingData = {};
  layout: LayoutData = {};

  constructor(
    private route: ActivatedRoute,
    private auth: Auth,
    private student: StudentApi,
  ) {}

  ngOnInit(): void {
    this.slug = (this.route.snapshot.paramMap.get('slug') ?? '').trim();

    if (!this.slug) {
      this.loading = false;
      this.error = 'Academy not found.';
      return;
    }

    this.auth.getAcademyInfo(this.slug).subscribe({
      next: (res) => {
        this.academy = res as AcademyPublicInfoExtended;
        this.branding = this.parseJson<BrandingData>(this.academy?.brandingJson);
        this.layout = this.parseJson<LayoutData>(this.academy?.layoutJson);
        this.loading = false;
        this.loadCourses();
      },
      error: (err) => {
        this.loading = false;
        this.error =
          err?.status === 404
            ? `Academy "${this.slug}" not found.`
            : 'Could not load academy page.';
      },
    });
  }

  private loadCourses(): void {
    this.coursesLoading = true;

    this.student.academyCourses(this.slug, '', '', 'newest', 1, 3).subscribe({
      next: (res) => {
        this.coursesLoading = false;
        const raw = res?.items ?? [];
        this.previewCourses = (raw as AcademyCoursePreview[]).slice(0, 3);
      },
      error: () => {
        this.coursesLoading = false;
        this.previewCourses = [];
      },
    });
  }

  get accentColor(): string {
    return this.academy?.primaryColor ?? '#1a56db';
  }

  get themeMode(): ThemeMode {
    const v = this.branding?.themeMode;
    return v === 'dark' || v === 'warm' ? v : 'light';
  }

  get heroLayout(): HeroLayout {
    const v = this.layout?.heroLayout;
    return v === 'centered' || v === 'immersive' ? v : 'split';
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

  get homeClasses(): string[] {
    return [
      `theme-${this.themeMode}`,
      `hero-${this.heroLayout}`,
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

  get tagline(): string {
    return this.branding?.tagline?.trim()
      || this.branding?.category?.trim()
      || 'Academy landing page';
  }

  get heroTitle(): string {
    return this.branding?.welcomeTitle?.trim()
      || `Welcome to ${this.academy?.name || 'Academy'}`;
  }

  get heroDescription(): string {
    return this.academy?.description?.trim()
      || 'Explore this academy, browse courses, and sign in as a student or instructor.';
  }

  get navPrimary(): string {
    return this.branding?.navLabelPrimary?.trim() || 'Explore';
  }

  get navSecondary(): string {
    return this.branding?.navLabelSecondary?.trim() || 'About';
  }

  get ctaPrimary(): string {
    return this.branding?.ctaPrimaryText?.trim() || 'Browse courses';
  }

  get ctaSecondary(): string {
    return this.branding?.ctaSecondaryText?.trim() || 'Contact';
  }

  get contactEmail(): string {
    return this.branding?.contactEmail?.trim() || '';
  }

  get showStats(): boolean {
    return this.branding?.showStats !== false;
  }

  get showTestimonials(): boolean {
    return this.branding?.showTestimonials !== false;
  }

  get footerText(): string {
    return this.branding?.footerText?.trim()
      || this.academy?.description?.trim()
      || 'A branded academy landing page for students and instructors.';
  }
get heroTitlePrefix(): string {
  return 'Welcome to ';
}

get heroTitleAccent(): string {
  return this.academy?.name?.trim() || 'Academy';
}

get heroTitleSuffix(): string {
  return '';
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

  get primaryGradient(): string {
    const dark = this.shadeHex(this.accentColor, -18);
    return `linear-gradient(135deg, ${this.accentColor} 0%, ${dark} 100%)`;
  }

  img(url?: string | null): string | null {
    if (!url) return null;
    return url.startsWith('http') ? url : `${this.api}${url}`;
  }

  toggleSignInMenu(): void {
    this.signInOpen = !this.signInOpen;
  }

  closeSignInMenu(): void {
    this.signInOpen = false;
  }

  @HostListener('document:click')
  onDocClick(): void {
    this.signInOpen = false;
  }

  stop(ev: Event): void {
    ev.stopPropagation();
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