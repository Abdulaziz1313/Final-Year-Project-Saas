export type ThemeMode = 'light' | 'warm' | 'dark';
export type HeroLayout = 'split' | 'centered' | 'immersive';
export type SurfaceStyle = 'soft' | 'outline' | 'glass';
export type RadiusKey = 'rounded' | 'sharp';
export type AccentStyle = 'solid' | 'gradient';

export type AcademyBrandingData = {
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

export type AcademyLayoutData = {
  heroLayout?: HeroLayout | null;
  surfaceStyle?: SurfaceStyle | null;
  radiusKey?: RadiusKey | null;
};

export type AcademyThemeViewModel = {
  academy: any | null;
  branding: AcademyBrandingData;
  layout: AcademyLayoutData;
  accentColor: string;
  themeMode: ThemeMode;
  accentStyle: AccentStyle;
  heroLayout: HeroLayout;
  surfaceStyle: SurfaceStyle;
  radiusKey: RadiusKey;
  fontFamily: string;
  homeClasses: string[];
  primaryGradient: string;
  primaryButtonStyle: Record<string, string | null>;
};