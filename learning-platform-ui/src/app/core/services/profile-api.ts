import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type ProfileDto = {
  userId: string;
  email: string;
  roles: string[];
  profileImageUrl: string | null;
  displayName?: string | null;
};

@Injectable({ providedIn: 'root' })
export class ProfileApi {
  private api = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  getProfile() {
    return this.http.get<ProfileDto>(`${this.api}/api/profile`);
  }

  uploadPhoto(file: File) {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post<{ profileImageUrl: string }>(`${this.api}/api/profile/photo`, fd);
  }

  changePassword(currentPassword: string, newPassword: string) {
  return this.http.post<{ message: string }>(
    `${this.api}/api/profile/change-password`,
    { currentPassword, newPassword }
  );
}

updateProfile(displayName: string | null) {
  return this.http.put<{ displayName: string | null }>(
    `${this.api}/api/profile`,
    { displayName }
  );
}

deleteAccount(password: string) {
  return this.http.post<{ message: string }>(
    `${this.api}/api/profile/delete`,
    { password }
  );
}


}
