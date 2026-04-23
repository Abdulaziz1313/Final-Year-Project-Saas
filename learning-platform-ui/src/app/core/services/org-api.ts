import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type OrgMeResponse = {
  userId: string;
  organization: null | {
    id: string;
    name: string;
    slug: string;
    website?: string | null;
    primaryColor: string;
    description?: string | null;
    logoUrl?: string | null;
    createdAt: string;
    isActive: boolean;
  };
};

export type OrgMemberItem = {
  id: string;
  email: string;
  displayName?: string | null;
  phoneNumber?: string | null;
  roles: string[];
  academyId?: string | null;
  academyName?: string | null;
  mustChangePassword?: boolean;
};

export type OrgMembersResponse = { items: OrgMemberItem[] };

export type OrgInviteCodeResponse = {
  organizationId: string;
  inviteCode: string;
  isActive: boolean;
};

export type ThemeMode = 'light' | 'warm' | 'dark';
export type HeroLayout = 'split' | 'centered' | 'immersive';
export type SurfaceStyle = 'soft' | 'outline' | 'glass';
export type RadiusKey = 'rounded' | 'sharp';
export type AccentStyle = 'solid' | 'gradient';

export type AcademySummary = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  website?: string | null;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  primaryColor: string;
  fontKey?: string | null;

  themeMode?: ThemeMode | null;
  heroLayout?: HeroLayout | null;
  surfaceStyle?: SurfaceStyle | null;
  radiusKey?: RadiusKey | null;
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

  brandingJson?: string | null;
  layoutJson?: string | null;

  isPublished: boolean;
  isHidden: boolean;
  hiddenReason?: string | null;
  hiddenAt?: string | null;
  createdAt: string;
  publishedAt?: string | null;
  courseCount: number;
  instructorCount: number;
};

export type OrgAcademyDetail = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  website?: string | null;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  primaryColor: string;
  fontKey?: string | null;

  themeMode?: ThemeMode | null;
  heroLayout?: HeroLayout | null;
  surfaceStyle?: SurfaceStyle | null;
  radiusKey?: RadiusKey | null;
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

  brandingJson?: string | null;
  layoutJson?: string | null;

  isPublished: boolean;
  isHidden: boolean;
  hiddenReason?: string | null;
  hiddenAt?: string | null;
  createdAt: string;
  publishedAt?: string | null;
  courseCount: number;
  instructorCount: number;
};

export type CreateAcademyRequest = {
  name: string;
  description?: string;
  website?: string;
  primaryColor?: string;
  logoUrl?: string;
  fontKey?: string;

  themeMode?: ThemeMode;
  heroLayout?: HeroLayout;
  surfaceStyle?: SurfaceStyle;
  radiusKey?: RadiusKey;
  accentStyle?: AccentStyle;

  tagline?: string;
  category?: string;
  contactEmail?: string;
  supportLabel?: string;
  welcomeTitle?: string;
  ctaPrimaryText?: string;
  ctaSecondaryText?: string;
  navLabelPrimary?: string;
  navLabelSecondary?: string;
  footerText?: string;
  showStats?: boolean;
  showTestimonials?: boolean;

  brandingJson?: string;
  layoutJson?: string;
};

export type UpdateAcademyRequest = {
  name: string;
  slug: string;
  description?: string | null;
  website?: string | null;
  primaryColor?: string | null;
  fontKey?: string | null;

  themeMode?: ThemeMode | null;
  heroLayout?: HeroLayout | null;
  surfaceStyle?: SurfaceStyle | null;
  radiusKey?: RadiusKey | null;
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

  brandingJson?: string | null;
  layoutJson?: string | null;
};

export type CreateInstructorRequest = {
  academyId: string;
  email: string;
  tempPassword: string;
  displayName?: string | null;
  sendEmail: boolean;
};

export type CreateInstructorResponse = {
  id: string;
  email: string;
  displayName?: string | null;
  academyId: string;
  academyName?: string | null;
  mustChangePassword: boolean;
  message: string;
};

export type PayoutSettingsResponse = {
  id: string;
  academyId: string;
  platformFeePercent: number;
  organizationFeePercent: number;
  instructorFeePercent: number;
  weeklyAutoReleaseEnabled: boolean;
  weeklyReleaseDay: number;
  currency: string;
};

export type UpdatePayoutSettingsRequest = {
  platformFeePercent: number;
  organizationFeePercent: number;
  instructorFeePercent: number;
  weeklyAutoReleaseEnabled: boolean;
  weeklyReleaseDay: number;
  currency?: string | null;
};

export type OrgEarningsSummaryResponse = {
  academyId: string;
  totalGross: number;
  totalPlatform: number;
  totalOrganization: number;
  totalInstructor: number;
  unpaidInstructor: number;
  pendingRequests: number;
};

export type OrgInstructorBalanceItem = {
  instructorUserId: string;
  instructor: {
    id?: string | null;
    email?: string | null;
    displayName?: string | null;
    profileImageUrl?: string | null;
  };
  lifetimeEarned: number;
  availableNow: number;
  processing: number;
  paidOut: number;
};

export type OrgPayoutRequestItem = {
  id: string;
  instructorUserId: string;
  instructor: {
    id?: string | null;
    email?: string | null;
    displayName?: string | null;
    profileImageUrl?: string | null;
  };
  requestedAmount: number;
  currency: string;
  status: string;
  messageToInstructor?: string | null;
  note?: string | null;
  createdAt: string;
  resolvedAt?: string | null;
  payoutId?: string | null;
};

export type ReleaseWeeklyPayoutsResponse = {
  academyId: string;
  weeklyReleaseDay: string;
  createdCount: number;
  payouts: Array<{
    id: string;
    instructorUserId: string;
    totalAmount: number;
    currency: string;
    status: string;
  }>;
};

export type MarkPayoutPaidResponse = {
  id: string;
  status: string;
  paidAt?: string | null;
};

@Injectable({ providedIn: 'root' })
export class OrgApi {
  private api = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  getMyOrg(): Observable<OrgMeResponse> {
    return this.http.get<OrgMeResponse>(`${this.api}/api/orgs/me`);
  }

  createOrg(body: {
    name: string;
    website?: string;
    description?: string;
    primaryColor?: string;
    logoUrl?: string;
  }): Observable<any> {
    return this.http.post<any>(`${this.api}/api/orgs`, body);
  }

  listAcademies(): Observable<AcademySummary[]> {
    return this.http.get<AcademySummary[]>(`${this.api}/api/orgs/academies`);
  }

  createAcademy(body: CreateAcademyRequest): Observable<any> {
    return this.http.post<any>(`${this.api}/api/orgs/academies`, {
      name: (body.name ?? '').trim(),
      description: body.description ?? null,
      website: body.website ?? null,
      primaryColor: body.primaryColor ?? null,
      logoUrl: body.logoUrl ?? null,
      fontKey: body.fontKey ?? null,

      themeMode: body.themeMode ?? 'light',
      heroLayout: body.heroLayout ?? 'split',
      surfaceStyle: body.surfaceStyle ?? 'soft',
      radiusKey: body.radiusKey ?? 'rounded',
      accentStyle: body.accentStyle ?? 'solid',

      tagline: body.tagline ?? null,
      category: body.category ?? null,
      contactEmail: body.contactEmail ?? null,
      supportLabel: body.supportLabel ?? null,
      welcomeTitle: body.welcomeTitle ?? null,
      ctaPrimaryText: body.ctaPrimaryText ?? null,
      ctaSecondaryText: body.ctaSecondaryText ?? null,
      navLabelPrimary: body.navLabelPrimary ?? null,
      navLabelSecondary: body.navLabelSecondary ?? null,
      footerText: body.footerText ?? null,
      showStats: body.showStats ?? true,
      showTestimonials: body.showTestimonials ?? true,

      brandingJson: body.brandingJson ?? null,
      layoutJson: body.layoutJson ?? null,
    });
  }

  getAcademy(academyId: string): Observable<OrgAcademyDetail> {
    return this.http.get<OrgAcademyDetail>(`${this.api}/api/orgs/academies/${academyId}`);
  }

  updateAcademy(academyId: string, body: UpdateAcademyRequest): Observable<OrgAcademyDetail> {
    return this.http.put<OrgAcademyDetail>(`${this.api}/api/orgs/academies/${academyId}`, {
      name: (body.name ?? '').trim(),
      slug: (body.slug ?? '').trim(),
      description: body.description ?? null,
      website: body.website ?? null,
      primaryColor: body.primaryColor ?? null,
      fontKey: body.fontKey ?? null,

      themeMode: body.themeMode ?? null,
      heroLayout: body.heroLayout ?? null,
      surfaceStyle: body.surfaceStyle ?? null,
      radiusKey: body.radiusKey ?? null,
      accentStyle: body.accentStyle ?? null,

      tagline: body.tagline ?? null,
      category: body.category ?? null,
      contactEmail: body.contactEmail ?? null,
      supportLabel: body.supportLabel ?? null,
      welcomeTitle: body.welcomeTitle ?? null,
      ctaPrimaryText: body.ctaPrimaryText ?? null,
      ctaSecondaryText: body.ctaSecondaryText ?? null,
      navLabelPrimary: body.navLabelPrimary ?? null,
      navLabelSecondary: body.navLabelSecondary ?? null,
      footerText: body.footerText ?? null,
      showStats: body.showStats ?? null,
      showTestimonials: body.showTestimonials ?? null,

      brandingJson: body.brandingJson ?? null,
      layoutJson: body.layoutJson ?? null,
    });
  }

  setAcademyPublish(academyId: string, publish: boolean): Observable<any> {
    return this.http.patch<any>(`${this.api}/api/orgs/academies/${academyId}/publish`, {
      isPublished: publish,
    });
  }

  deleteAcademy(academyId: string): Observable<any> {
    return this.http.delete<any>(`${this.api}/api/orgs/academies/${academyId}`);
  }

  listMembers(q = '', role = ''): Observable<OrgMembersResponse> {
    let params = new HttpParams();
    if (q) params = params.set('q', q);
    if (role) params = params.set('role', role);
    return this.http.get<OrgMembersResponse>(`${this.api}/api/orgs/members`, { params });
  }

  createInstructor(body: CreateInstructorRequest): Observable<CreateInstructorResponse> {
    return this.http.post<CreateInstructorResponse>(`${this.api}/api/orgs/instructors`, {
      academyId: (body.academyId ?? '').trim(),
      email: (body.email ?? '').trim(),
      tempPassword: (body.tempPassword ?? '').trim(),
      displayName: body.displayName ?? null,
      sendEmail: !!body.sendEmail,
    });
  }

  getInviteCode(): Observable<OrgInviteCodeResponse> {
    return this.http.get<OrgInviteCodeResponse>(`${this.api}/api/orgs/invite-code`);
  }

  rotateInviteCode(): Observable<OrgInviteCodeResponse> {
    return this.http.post<OrgInviteCodeResponse>(`${this.api}/api/orgs/invite-code/rotate`, {});
  }

  joinOrg(inviteCode: string): Observable<any> {
    return this.http.post<any>(`${this.api}/api/orgs/join`, { inviteCode });
  }

  leaveOrg(): Observable<any> {
    return this.http.post<any>(`${this.api}/api/orgs/leave`, {});
  }

  uploadAcademyLogo(academyId: string, file: File): Observable<any> {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post<any>(`${this.api}/api/academies/${academyId}/logo`, fd);
  }

  uploadAcademyBanner(academyId: string, file: File): Observable<any> {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post<any>(`${this.api}/api/academies/${academyId}/banner`, fd);
  }

  deleteAcademyLogo(academyId: string): Observable<any> {
    return this.http.delete<any>(`${this.api}/api/academies/${academyId}/logo`);
  }

  deleteAcademyBanner(academyId: string): Observable<any> {
    return this.http.delete<any>(`${this.api}/api/academies/${academyId}/banner`);
  }

  getPayoutSettings(academyId: string) {
    return this.http.get<PayoutSettingsResponse>(
      `${this.api}/api/payments/org/academy/${academyId}/payout-settings`
    );
  }

  updatePayoutSettings(academyId: string, payload: UpdatePayoutSettingsRequest) {
    return this.http.put<PayoutSettingsResponse>(
      `${this.api}/api/payments/org/academy/${academyId}/payout-settings`,
      payload
    );
  }

  getAcademyEarningsSummary(academyId: string) {
    return this.http.get<OrgEarningsSummaryResponse>(
      `${this.api}/api/payments/org/academy/${academyId}/earnings-summary`
    );
  }

  getInstructorBalances(academyId: string) {
    return this.http.get<OrgInstructorBalanceItem[]>(
      `${this.api}/api/payments/org/academy/${academyId}/instructors`
    );
  }

  getPayoutRequests(academyId: string) {
    return this.http.get<OrgPayoutRequestItem[]>(
      `${this.api}/api/payments/org/academy/${academyId}/payout-requests`
    );
  }

  releaseWeeklyPayouts(academyId: string) {
    return this.http.post<ReleaseWeeklyPayoutsResponse>(
      `${this.api}/api/payments/org/academy/${academyId}/release-weekly`,
      { academyId }
    );
  }

  markPayoutPaid(payoutId: string, note?: string | null) {
    return this.http.post<MarkPayoutPaidResponse>(
      `${this.api}/api/payments/org/payouts/${payoutId}/mark-paid`,
      { note: note ?? null }
    );
  }
}