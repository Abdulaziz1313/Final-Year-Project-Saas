import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AdminApi {
  private api = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  // ---- Users ----
  listUsers(q = '', role = 'all', page = 1, pageSize = 25) {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (role && role !== 'all') params.set('role', role);
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));
    return this.http.get<any>(`${this.api}/api/admin/users?${params.toString()}`);
  }

  setUserLock(userId: string, payload: { locked: boolean; days?: number | null; permanent?: boolean }) {
    return this.http.put(`${this.api}/api/admin/users/${userId}/lock`, payload);
  }

  setUserRoles(userId: string, roles: string[]) {
    return this.http.put(`${this.api}/api/admin/users/${userId}/roles`, { roles });
  }

  // Assign user to an organization 
  setUserOrganization(userId: string, organizationId: string | null) {
    return this.http.put(`${this.api}/api/admin/users/${userId}/organization`, { organizationId });
  }

  // delete user 
  deleteUser(userId: string, reason: string) {
    const params = new URLSearchParams();
    if (reason) params.set('reason', reason);
    return this.http.delete(`${this.api}/api/admin/users/${userId}?${params.toString()}`);
  }

  // ---- Organizations ----
  listOrganizations(q = '', page = 1, pageSize = 25) {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));
    return this.http.get<any>(`${this.api}/api/admin/organizations?${params.toString()}`);
  }

  createOrganization(payload: {
    name: string;
    slug?: string | null;
    website?: string | null;
    primaryColor?: string | null;
    description?: string | null;
    logoUrl?: string | null;
  }) {
    return this.http.post<any>(`${this.api}/api/admin/organizations`, payload);
  }

  updateOrganization(
    orgId: string,
    payload: {
      name?: string | null;
      slug?: string | null;
      website?: string | null;
      primaryColor?: string | null;
      description?: string | null;
      logoUrl?: string | null;
      regenerateInviteCode?: boolean | null;
    }
  ) {
    return this.http.put<any>(`${this.api}/api/admin/organizations/${orgId}`, payload);
  }

  // enable/disable organization
  setOrgActive(orgId: string, isActive: boolean, reason?: string | null) {
    return this.http.put(`${this.api}/api/admin/organizations/${orgId}/active`, {
      isActive,
      reason: reason ?? null,
    });
  }

  // delete organization 
  deleteOrganization(orgId: string, reason: string) {
    const params = new URLSearchParams();
    if (reason) params.set('reason', reason);
    return this.http.delete(`${this.api}/api/admin/organizations/${orgId}?${params.toString()}`);
  }

  // ---- Academies ----
  listAcademies(q = '', status = 'all', page = 1, pageSize = 25) {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (status) params.set('status', status);
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));
    return this.http.get<any>(`${this.api}/api/admin/academies?${params.toString()}`);
  }

  moderateAcademy(id: string, isHidden: boolean, reason: string | null) {
    return this.http.put(`${this.api}/api/admin/academies/${id}/moderate`, { isHidden, reason });
  }

  deleteAcademy(id: string, reason: string) {
    const params = new URLSearchParams();
    if (reason) params.set('reason', reason);
    return this.http.delete(`${this.api}/api/admin/academies/${id}?${params.toString()}`);
  }

  // ---- Courses ----
  listCourses(q = '', status = 'all', page = 1, pageSize = 25) {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (status) params.set('status', status);
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));
    return this.http.get<any>(`${this.api}/api/admin/courses?${params.toString()}`);
  }

  moderateCourse(id: string, isHidden: boolean, reason: string | null) {
    return this.http.put(`${this.api}/api/admin/courses/${id}/moderate`, { isHidden, reason });
  }

  deleteCourse(id: string, reason: string) {
    const params = new URLSearchParams();
    if (reason) params.set('reason', reason);
    return this.http.delete(`${this.api}/api/admin/courses/${id}?${params.toString()}`);
  }

  // ---- Audit ----
  listAudit(q = '', action = 'all', targetType = 'all', page = 1, pageSize = 25) {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (action && action !== 'all') params.set('action', action);
    if (targetType && targetType !== 'all') params.set('targetType', targetType);
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));
    return this.http.get<any>(`${this.api}/api/admin/audit?${params.toString()}`);
  }
}