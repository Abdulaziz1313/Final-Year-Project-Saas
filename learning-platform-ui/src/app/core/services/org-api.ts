import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type OrgMeResponse = {
  userId: string;
  organization: null | {
    id: string; name: string; slug: string;
    website?: string | null; primaryColor: string;
    description?: string | null; logoUrl?: string | null;
    createdAt: string; isActive: boolean;
  };
};

export type OrgMemberItem = {
  id: string; email: string;
  displayName?: string | null; phoneNumber?: string | null;
  roles: string[]; academyId?: string | null; academyName?: string | null;
};
export type OrgMembersResponse = { items: OrgMemberItem[] };
export type OrgInviteCodeResponse = { organizationId: string; inviteCode: string; isActive: boolean };

export type AcademySummary = {
  id: string; name: string; slug: string;
  description?: string | null; logoUrl?: string | null;
  primaryColor: string; isPublished: boolean; isHidden: boolean;
  createdAt: string; publishedAt?: string | null;
  courseCount: number; instructorCount: number;
};

@Injectable({ providedIn: 'root' })
export class OrgApi {
  private api = environment.apiBaseUrl;
  constructor(private http: HttpClient) {}

  // ── My org ────────────────────────────────────────────────
  getMyOrg() {
    return this.http.get<OrgMeResponse>(this.api + '/api/orgs/me');
  }

  createOrg(body: { name: string; website?: string; description?: string; primaryColor?: string; logoUrl?: string }) {
    return this.http.post<any>(this.api + '/api/orgs', body);
  }

  // ── Academy management (OrgAdmin) ─────────────────────────
  listAcademies() {
    return this.http.get<AcademySummary[]>(this.api + '/api/orgs/academies');
  }

  createAcademy(body: { name: string; description?: string; website?: string; primaryColor?: string; logoUrl?: string; fontKey?: string }) {
    return this.http.post<any>(this.api + '/api/orgs/academies', body);
  }

  getAcademy(academyId: string) {
    return this.http.get<any>(this.api + '/api/orgs/academies/' + academyId);
  }

  // ── Members ───────────────────────────────────────────────
  listMembers(q = '', role = '') {
    let params = new HttpParams();
    if (q) params = params.set('q', q);
    if (role) params = params.set('role', role);
    return this.http.get<OrgMembersResponse>(this.api + '/api/orgs/members', { params });
  }

  // ── Invite code ───────────────────────────────────────────
  getInviteCode() {
    return this.http.get<OrgInviteCodeResponse>(this.api + '/api/orgs/invite-code');
  }

  rotateInviteCode() {
    return this.http.post<OrgInviteCodeResponse>(this.api + '/api/orgs/invite-code/rotate', {});
  }

  // ── Join / leave ──────────────────────────────────────────
  joinOrg(inviteCode: string) {
    return this.http.post<any>(this.api + '/api/orgs/join', { inviteCode });
  }

  leaveOrg() {
    return this.http.post(this.api + '/api/orgs/leave', {});
  }

  setAcademyPublish(academyId: string, publish: boolean): Observable<any> {
  return this.http.patch<any>(`${this.api}/api/orgs/academies/${academyId}/publish`, { isPublished: publish });
}

deleteAcademy(academyId: string): Observable<any> {
  return this.http.delete<any>(`${this.api}/api/orgs/academies/${academyId}`);
}
}