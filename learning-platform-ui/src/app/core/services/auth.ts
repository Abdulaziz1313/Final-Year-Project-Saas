import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export type Role = 'Admin' | 'OrgAdmin' | 'Instructor' | 'Student' | 'Coordinator';
interface AuthResponse { accessToken: string; }
export interface AcademyPublicInfo {
  id: string; name: string; slug: string;
  logoUrl?: string | null; primaryColor: string;
  description?: string | null; isPublished: boolean;
  orgName?: string | null; orgIsActive: boolean;
}

@Injectable({ providedIn: 'root' })
export class Auth {
  private readonly tokenKey = 'lp_token';
  private readonly baseUrl = environment.apiBaseUrl + '/api/auth';
  constructor(private http: HttpClient) {}

  login(email: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(this.baseUrl + '/login', { email, password })
      .pipe(tap((r) => this.setToken(r.accessToken)));
  }
  logout(): void { localStorage.removeItem(this.tokenKey); }
  getToken(): string | null { return localStorage.getItem(this.tokenKey); }
  isLoggedIn(): boolean { return !!this.getToken(); }
  isInstructor(): boolean { return this.hasRole('Instructor'); }
  isStudent(): boolean { return this.hasRole('Student'); }
  isAdmin(): boolean { return this.hasRole('Admin'); }
  isOrgAdmin(): boolean { return this.hasRole('OrgAdmin'); }
  isCoordinator(): boolean { return this.hasRole('Coordinator'); }

  getRoles(): string[] {
    const token = this.getToken();
    if (!token) return [];
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      const keys = ['role', 'roles', 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role'];
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
    } catch { return []; }
  }

  hasRole(role: string): boolean { return this.getRoles().includes(role); }

  getClaim(key: string): string | null {
    const token = this.getToken();
    if (!token) return null;
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return payload[key] ?? null;
    } catch { return null; }
  }

  getAcademyId(): string | null { return this.getClaim('academyId'); }
  getOrgId(): string | null     { return this.getClaim('organizationId'); }

  /** Public: academy branding info for register/login pages. */
  getAcademyInfo(slug: string): Observable<AcademyPublicInfo> {
    return this.http.get<AcademyPublicInfo>(this.baseUrl + '/academy-info', { params: { slug } });
  }

  /** Organization 2-step registration. */
  orgRegisterStart(email: string, password: string, phone: string) {
    return this.http.post<{ email: string; expiresInSeconds: number }>(
      this.baseUrl + '/org-register-start', { email, password, phone });
  }
  orgRegisterConfirm(email: string, code: string, orgName: string, website?: string, description?: string) {
    return this.http.post<{ message: string; orgName: string; orgSlug: string }>(
      this.baseUrl + '/org-register-confirm', { email, code, orgName, website, description });
  }

  /** Instructor 2-step registration. */
  instructorRegisterStart(email: string, password: string, phone: string, academySlug: string) {
    return this.http.post<{ email: string; expiresInSeconds: number }>(
      this.baseUrl + '/instructor-register-start', { email, password, phone, academySlug });
  }
  instructorRegisterConfirm(email: string, code: string, academySlug: string, displayName?: string) {
    return this.http.post<{ message: string }>(
      this.baseUrl + '/instructor-register-confirm', { email, code, academySlug, displayName });
  }

  /** Student 2-step registration. */
  studentRegisterStart(email: string, password: string, phone: string, academySlug: string): Observable<any> {
    return this.http.post<any>(
      this.baseUrl + '/student-register-start', { email, password, phone, academySlug });
  }
  studentRegisterConfirm(email: string, code: string, academySlug: string, displayName?: string): Observable<any> {
    return this.http.post<any>(
      this.baseUrl + '/student-register-confirm', { email, code, academySlug, displayName: displayName ?? null });
  }

  /** Student registration. */
  registerStart(email: string, password: string, role: string, phone: string) {
    return this.http.post<{ email: string; expiresInSeconds: number }>(
      this.baseUrl + '/register-start', { email, password, role, phone });
  }
  registerConfirm(email: string, code: string) {
    return this.http.post<{ message: string }>(this.baseUrl + '/register-confirm', { email, code });
  }

  private setToken(token: string): void { localStorage.setItem(this.tokenKey, token); }
}

export { Auth as AuthService };