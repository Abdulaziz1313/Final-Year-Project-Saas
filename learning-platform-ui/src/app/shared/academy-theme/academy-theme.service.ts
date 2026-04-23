import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { Auth, AcademyPublicInfo } from '../../core/services/auth';
import {
  AcademyBrandingData,
  AcademyLayoutData,
  AcademyThemeViewModel,
  AccentStyle,
  HeroLayout,
  RadiusKey,
  SurfaceStyle,
  ThemeMode
} from './academy-theme.model';

type AcademyPublicInfoExtended = AcademyPublicInfo & {
  brandingJson?: string | null;
  layoutJson?: string | null;
  fontKey?: string | null;
  website?: string | null;
  orgName?: string | null;
};

@Injectable({ providedIn: 'root' })
export class AcademyThemeService {
  constructor(private auth: Auth) {}

  loadBySlug(slug: string): Observable<AcademyThemeViewModel | null> {
    const cleanSlug = (slug ?? '').trim();
    if (!cleanSlug) return of(null);

    return this.auth.getAcademyInfo(cleanSlug).pipe(
      map((academy) => this.buildThemeVm(academy as AcademyPublicInfoExtended)),
      catchError(() => of(null))
    );
  }

  buildThemeVm(academy: AcademyPublicInfoExtended): AcademyThemeViewModel {
    const branding = this.parseJson<AcademyBrandingData>(academy?.brandingJson);
    const layout = this.parseJson<AcademyLayoutData>(academy?.layoutJson);

    const accentColor = academy?.primaryColor ?? '#1a56db';
    const themeMode: ThemeMode =
      branding?.themeMode === 'dark' || branding?.themeMode === 'warm'
        ? branding.themeMode
        : 'light';

    const accentStyle: AccentStyle =
      branding?.accentStyle === 'gradient' ? 'gradient' : 'solid';

    const heroLayout: HeroLayout =
      layout?.heroLayout === 'centered' || layout?.heroLayout === 'immersive'
        ? layout.heroLayout
        : 'split';

    const surfaceStyle: SurfaceStyle =
      layout?.surfaceStyle === 'outline' || layout?.surfaceStyle === 'glass'
        ? layout.surfaceStyle
        : 'soft';

    const radiusKey: RadiusKey =
      layout?.radiusKey === 'sharp' ? 'sharp' : 'rounded';

    const fontFamily = this.resolveFontFamily(academy?.fontKey);
    const primaryGradient = this.buildGradient(accentColor);

    return {
      academy,
      branding,
      layout,
      accentColor,
      themeMode,
      accentStyle,
      heroLayout,
      surfaceStyle,
      radiusKey,
      fontFamily,
      homeClasses: [
        `theme-${themeMode}`,
        `hero-${heroLayout}`,
        `surface-${surfaceStyle}`,
        `radius-${radiusKey}`,
      ],
      primaryGradient,
      primaryButtonStyle:
        accentStyle === 'gradient'
          ? {
              background: null,
              backgroundImage: primaryGradient,
              borderColor: 'transparent',
              color: '#ffffff',
            }
          : {
              background: accentColor,
              backgroundImage: 'none',
              borderColor: accentColor,
              color: '#ffffff',
            },
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

  private resolveFontFamily(fontKey?: string | null): string {
    switch ((fontKey ?? 'system').toLowerCase()) {
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

  private buildGradient(hex: string): string {
    const dark = this.shadeHex(hex, -18);
    return `linear-gradient(135deg, ${hex} 0%, ${dark} 100%)`;
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