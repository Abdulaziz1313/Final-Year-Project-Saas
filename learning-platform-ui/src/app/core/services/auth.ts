import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export type Role = 'Admin' | 'OrgAdmin' | 'Instructor' | 'Student' | 'Coordinator';

interface AuthResponse {
  accessToken: string;
}

export interface AcademyPublicInfo {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  website?: string | null;
  primaryColor: string;
  description?: string | null;

  // academy theme / branding support
  fontKey?: string | null;
  brandingJson?: string | null;
  layoutJson?: string | null;

  isPublished: boolean;
  orgName?: string | null;
  orgIsActive: boolean;
}

export interface OrgPublicAcademyCard {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  primaryColor?: string | null;

  // academy theme / branding support
  fontKey?: string | null;
  brandingJson?: string | null;
  layoutJson?: string | null;

  courseCount: number;
}

export interface OrgPublicInfo {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  primaryColor: string;
  description?: string | null;
  website?: string | null;
  academies: OrgPublicAcademyCard[];
}

export interface ForgotPasswordResponse {
  message: string;
}

export interface ResetPasswordResponse {
  message: string;
}

export interface FirstLoginChangePasswordResponse {
  message: string;
}

export interface InstructorRegisterStartResponse {
  message: string;
}

export interface InstructorRegisterConfirmResponse {
  message: string;
}

export interface StudentRegisterStartResponse {
  message: string;
}

export interface StudentRegisterConfirmResponse {
  message: string;
}

export interface OrgRegisterStartResponse {
  message: string;
}

export interface OrgRegisterConfirmResponse {
  message: string;
}

@Injectable({ providedIn: 'root' })
export class Auth {
  private readonly tokenKey = 'lp_token';
  private readonly baseUrl = `${environment.apiBaseUrl}/api/auth`;

  constructor(private http: HttpClient) {}

  // =========================================================
  // LOGIN / LOGOUT
  // =========================================================

  login(email: string, password: string): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.baseUrl}/login`, {
        email: this.clean(email),
        password: password ?? '',
      })
      .pipe(tap((r) => this.setToken(r.accessToken)));
  }

  loginInstructor(email: string, password: string, academySlug: string): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.baseUrl}/login-instructor`, {
        email: this.clean(email),
        password: password ?? '',
        academySlug: this.clean(academySlug),
      })
      .pipe(tap((r) => this.setToken(r.accessToken)));
  }

  loginStudent(email: string, password: string, academySlug: string): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.baseUrl}/login-student`, {
        email: this.clean(email),
        password: password ?? '',
        academySlug: this.clean(academySlug),
      })
      .pipe(tap((r) => this.setToken(r.accessToken)));
  }

  logout(): void {
    localStorage.removeItem(this.tokenKey);
    sessionStorage.removeItem('return_url');
    sessionStorage.removeItem('login_notice');
  }

  // =========================================================
  // FIRST LOGIN (INSTRUCTOR) — CHANGE PASSWORD
  // =========================================================

  firstLoginChangePassword(
    currentPassword: string,
    newPassword: string
  ): Observable<FirstLoginChangePasswordResponse> {
    return this.http.post<FirstLoginChangePasswordResponse>(
      `${this.baseUrl}/first-login-change-password`,
      {
        currentPassword: this.clean(currentPassword),
        newPassword: this.clean(newPassword),
      }
    );
  }

  // =========================================================
  // FORGOT / RESET PASSWORD
  // =========================================================

  forgotPassword(email: string, academySlug?: string | null): Observable<ForgotPasswordResponse> {
    const payload: Record<string, string> = {
      email: this.clean(email),
    };

    const slug = this.clean(academySlug);
    if (slug) payload['academySlug'] = slug;

    return this.http.post<ForgotPasswordResponse>(`${this.baseUrl}/forgot-password`, payload);
  }

  resetPassword(email: string, token: string, newPassword: string): Observable<ResetPasswordResponse> {
    return this.http.post<ResetPasswordResponse>(`${this.baseUrl}/reset-password`, {
      email: this.clean(email),
      token: this.clean(token),
      newPassword: this.clean(newPassword),
    });
  }

  // =========================================================
  // INSTRUCTOR REGISTRATION
  // =========================================================

  instructorRegisterStart(
    email: string,
    password: string,
    phone: string,
    academySlug: string
  ): Observable<InstructorRegisterStartResponse> {
    return this.http.post<InstructorRegisterStartResponse>(`${this.baseUrl}/instructor-register-start`, {
      email: this.clean(email),
      password: this.clean(password),
      phone: this.clean(phone),
      academySlug: this.clean(academySlug),
    });
  }

  instructorRegisterConfirm(
    email: string,
    code: string,
    academySlug: string,
    displayName?: string | null
  ): Observable<InstructorRegisterConfirmResponse> {
    return this.http.post<InstructorRegisterConfirmResponse>(`${this.baseUrl}/instructor-register-confirm`, {
      email: this.clean(email),
      code: this.clean(code),
      academySlug: this.clean(academySlug),
      displayName: this.clean(displayName),
    });
  }

  // =========================================================
  // STUDENT REGISTRATION
  // =========================================================

  studentRegisterStart(
    email: string,
    password: string,
    phone: string,
    academySlug: string
  ): Observable<StudentRegisterStartResponse> {
    return this.http.post<StudentRegisterStartResponse>(`${this.baseUrl}/student-register-start`, {
      email: this.clean(email),
      password: this.clean(password),
      phone: this.clean(phone),
      academySlug: this.clean(academySlug),
    });
  }

  studentRegisterConfirm(
    email: string,
    code: string,
    academySlug: string,
    displayName?: string | null
  ): Observable<StudentRegisterConfirmResponse> {
    return this.http.post<StudentRegisterConfirmResponse>(`${this.baseUrl}/student-register-confirm`, {
      email: this.clean(email),
      code: this.clean(code),
      academySlug: this.clean(academySlug),
      displayName: this.clean(displayName),
    });
  }

  // =========================================================
  // ORGANIZATION REGISTRATION
  // =========================================================

  orgRegisterStart(
    email: string,
    password: string,
    phone: string
  ): Observable<OrgRegisterStartResponse> {
    return this.http.post<OrgRegisterStartResponse>(`${this.baseUrl}/org-register-start`, {
      email: this.clean(email),
      password: this.clean(password),
      phone: this.clean(phone),
    });
  }

  orgRegisterConfirm(
    email: string,
    code: string,
    orgName: string,
    website?: string | null,
    displayName?: string | null
  ): Observable<OrgRegisterConfirmResponse> {
    return this.http.post<OrgRegisterConfirmResponse>(`${this.baseUrl}/org-register-confirm`, {
      email: this.clean(email),
      code: this.clean(code),
      orgName: this.clean(orgName),
      website: this.clean(website),
      displayName: this.clean(displayName),
    });
  }

  // =========================================================
  // TOKEN + SESSION HELPERS
  // =========================================================

  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  isLoggedIn(): boolean {
    return !!this.getToken();
  }

  isInstructor(): boolean { return this.hasRole('Instructor'); }
  isStudent(): boolean { return this.hasRole('Student'); }
  isAdmin(): boolean { return this.hasRole('Admin'); }
  isOrgAdmin(): boolean { return this.hasRole('OrgAdmin'); }
  isCoordinator(): boolean { return this.hasRole('Coordinator'); }

  private decodePayload(token: string): any | null {
    try {
      const base64Url = token.split('.')[1];
      if (!base64Url) return null;

      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=');
      return JSON.parse(atob(padded));
    } catch {
      return null;
    }
  }

  getRoles(): string[] {
    const token = this.getToken();
    if (!token) return [];

    const payload = this.decodePayload(token);
    if (!payload) return [];

    const keys = [
      'role',
      'roles',
      'http://schemas.microsoft.com/ws/2008/06/identity/claims/role',
    ];

    for (const k of keys) {
      const v = payload[k];
      if (typeof v === 'string') return [v];
      if (Array.isArray(v)) return v;
    }

    for (const key of Object.keys(payload)) {
      if (key.toLowerCase().endsWith('/role')) {
        const v = payload[key];
        if (typeof v === 'string') return [v];
        if (Array.isArray(v)) return v;
      }
    }

    return [];
  }

  hasRole(role: string): boolean {
    return this.getRoles().includes(role);
  }

  getClaim(key: string): any | null {
    const token = this.getToken();
    if (!token) return null;

    const payload = this.decodePayload(token);
    if (!payload) return null;

    return payload[key] ?? null;
  }

  getAcademyId(): string | null {
    return this.getClaim('academyId');
  }

  getOrgId(): string | null {
    return this.getClaim('organizationId');
  }

  mustChangePassword(): boolean {
    const v = this.getClaim('mustChangePassword');
    if (typeof v === 'boolean') return v;
    if (typeof v === 'string') return v.toLowerCase() === 'true';
    return false;
  }

  // =========================================================
  // PUBLIC: ACADEMY INFO
  // =========================================================

  getAcademyInfo(slug: string): Observable<AcademyPublicInfo> {
    return this.http.get<AcademyPublicInfo>(`${this.baseUrl}/academy-info`, {
      params: { slug: this.clean(slug) },
    });
  }

  getOrgPublicInfo(slug: string): Observable<OrgPublicInfo> {
    return this.http.get<OrgPublicInfo>(
      `${environment.apiBaseUrl}/api/orgs/public/${encodeURIComponent(this.clean(slug))}`
    );
  }

  // =========================================================
  // PRIVATE HELPERS
  // =========================================================

  private setToken(token: string): void {
    localStorage.setItem(this.tokenKey, token);
  }

  private clean(value?: string | null): string {
    return (value ?? '').trim();
  }
}

export { Auth as AuthService };