import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type PublicAcademy = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;

  logoUrl?: string | null;
  bannerUrl?: string | null;
  primaryColor?: string | null;

  // ✅ NEW: font branding
  fontKey?: string | null;
  customFontUrl?: string | null;
  customFontFamily?: string | null;

  // optional (your API may return it)
  publishedAt?: string | null;
};

export type CatalogCourse = {
  id: string;
  title: string;
  shortDescription?: string;
  category?: string;
  tagsJson?: string;
  isFree: boolean;
  price?: number | null;
  currency?: string;
  thumbnailUrl?: string | null;
  createdAt?: string;
};

export type CatalogAcademy = {
  id: string;
  name: string;
  slug: string;

  logoUrl?: string | null;
  bannerUrl?: string | null;
  primaryColor?: string | null;
  description?: string | null;

  // ✅ NEW: font branding
  fontKey?: string | null;
  customFontUrl?: string | null;
  customFontFamily?: string | null;

  publishedAt?: string | null;
};

export type CatalogListResponse = {
  academy: CatalogAcademy;
  total: number;
  page: number;
  pageSize: number;
  items: CatalogCourse[];
};

export type CoursePublic = {
  id: string;
  title: string;
  shortDescription?: string;
  fullDescription?: string;
  isFree: boolean;
  price?: number | null;
  currency?: string;
  category?: string;
  tagsJson?: string;
  thumbnailUrl?: string | null;

  academy?: {
    id: string;
    name: string;
    slug: string;

    logoUrl?: string | null;
    bannerUrl?: string | null; // ✅ FIX: added
    primaryColor?: string | null;

    // ✅ NEW: font branding
    fontKey?: string | null;
    customFontUrl?: string | null;
    customFontFamily?: string | null;
  } | null;

  modules: Array<{
    id: string;
    title: string;
    sortOrder: number;
    lessons: Array<{
      id: string;
      title: string;
      type: number;
      sortOrder: number;
      isPreviewFree: boolean;
    }>;
  }>;
};

export type MyLearningItem = {
  course: {
    id: string;
    title: string;
    shortDescription?: string;
    thumbnailUrl?: string | null;
    category?: string | null;

    // ✅ NEW: moderation fields
    isHidden?: boolean;
    hiddenReason?: string | null;
    hiddenAt?: string | null;
  };
  enrollment: {
    status: number;
    enrolledAt: string;
    lastLessonId?: string | null;
  };
  progress: {
    done: number;
    total: number;
    percent: number;
  };
};


export type PlayerCourse = {
  id: string;
  title: string;
  lastLessonId?: string | null;
  modules: Array<{
    id: string;
    title: string;
    lessons: Array<{
      id: string;
      title: string;
      type: number;
      contentUrl?: string | null;
      htmlContent?: string | null;
      isPreviewFree: boolean;
      isDownloadable: boolean;
      completedLessonIds?: string[];

    }>;
  }>;
};

@Injectable({ providedIn: 'root' })
export class StudentApi {
  private api = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  // Public
  academyCourses(slug: string, q = '', tag = '', sort = 'newest', page = 1, pageSize = 12) {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (tag) params.set('tag', tag);
    if (sort) params.set('sort', sort);
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));

    return this.http.get<CatalogListResponse>(
      `${this.api}/api/catalog/academies/${encodeURIComponent(slug)}/courses?${params.toString()}`
    );
  }

  coursePublic(id: string) {
    return this.http.get<CoursePublic>(`${this.api}/api/catalog/courses/${id}`);
  }

  // Student (auth)
  enroll(courseId: string) {
    return this.http.post<{ message: string }>(`${this.api}/api/learning/courses/${courseId}/enroll`, {});
  }

  myLearning() {
    return this.http.get<MyLearningItem[]>(`${this.api}/api/learning/me/enrollments`);
  }

  courseContent(courseId: string) {
    return this.http.get<PlayerCourse>(`${this.api}/api/learning/me/courses/${courseId}/content`);
  }

  completeLesson(lessonId: string) {
    return this.http.post(`${this.api}/api/learning/me/lessons/${lessonId}/complete`, {});
  }

  setLastLesson(courseId: string, lessonId: string) {
    return this.http.post(`${this.api}/api/learning/me/courses/${courseId}/last-lesson/${lessonId}`, {});
  }

  listAcademies(q = '', sort = 'newest') {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (sort) params.set('sort', sort);

    return this.http.get<PublicAcademy[]>(
      `${this.api}/api/catalog/academies?${params.toString()}`
    );
  }
}
