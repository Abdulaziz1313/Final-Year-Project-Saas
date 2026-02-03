import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  message: string;
  linkUrl?: string | null;
  isRead: boolean;
  createdAt: string;
};

@Injectable({ providedIn: 'root' })
export class NotificationApi {
  private api = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  unreadCount() {
    return this.http.get<{ count: number }>(`${this.api}/api/notifications/unread-count`);
  }

  list(unreadOnly = false) {
    return this.http.get<{ total: number; items: NotificationItem[] }>(
      `${this.api}/api/notifications?unreadOnly=${unreadOnly}`
    );
  }

  markRead(id: string) {
    return this.http.post(`${this.api}/api/notifications/${id}/read`, {});
  }

  markAllRead() {
    return this.http.post(`${this.api}/api/notifications/read-all`, {});
  }

  // dev helper
  test(title: string, message: string, type = 'info', linkUrl?: string) {
    return this.http.post(`${this.api}/api/notifications/test`, { title, message, type, linkUrl });
  }
}
