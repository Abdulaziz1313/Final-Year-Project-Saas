import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export type Role = 'Admin' | 'Instructor' | 'Student' | 'Coordinator';

interface AuthResponse {
  accessToken: string;
}

@Injectable({
  providedIn: 'root',
})
export class Auth {
  private readonly tokenKey = 'lp_token';
  private readonly baseUrl = `${environment.apiBaseUrl}/api/auth`;

  constructor(private http: HttpClient) {}

  login(email: string, password: string): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.baseUrl}/login`, { email, password })
      .pipe(tap((r) => this.setToken(r.accessToken)));
  }

  logout(): void {
    localStorage.removeItem(this.tokenKey);
  }

  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  isLoggedIn(): boolean {
    return !!this.getToken();
  }

  isInstructor(): boolean {
    return this.hasRole('Instructor');
  }

  isStudent(): boolean {
    return this.hasRole('Student');
  }

  isAdmin(): boolean {
    return this.hasRole('Admin');
  }

  isCoordinator(): boolean {
    return this.hasRole('Coordinator');
  }

  private setToken(token: string): void {
    localStorage.setItem(this.tokenKey, token);
  }

  getRoles(): string[] {
    const token = this.getToken();
    if (!token) return [];

    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));

      const possibleKeys = [
        'role',
        'roles',
        'http://schemas.microsoft.com/ws/2008/06/identity/claims/role',
      ];

      for (const k of possibleKeys) {
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
    } catch {
      return [];
    }
  }

  hasRole(role: string): boolean {
    return this.getRoles().includes(role);
  }

  registerStart(email: string, password: string, role: string, phone: string) {
    return this.http.post<{ email: string; expiresInSeconds: number }>(
      `${this.baseUrl}/register-start`,
      { email, password, role, phone }
    );
  }

  registerConfirm(email: string, code: string) {
    return this.http.post<{ message: string }>(
      `${this.baseUrl}/register-confirm`,
      { email, code }
    );
  }
}

// Alias so components can import as either `Auth` or `AuthService`
export { Auth as AuthService };