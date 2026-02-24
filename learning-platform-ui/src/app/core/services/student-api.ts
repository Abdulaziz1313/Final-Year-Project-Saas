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

  fontKey?: string | null;
  customFontUrl?: string | null;
  customFontFamily?: string | null;

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
    bannerUrl?: string | null;
    primaryColor?: string | null;

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

export type QuizSubmitResult = {
  attemptId?: string;
  score: number;
  maxScore: number;
  status?: number;
  Status?: number;
};

/* =========================
   ✅ Reviews (NEW)
========================= */

export type ReviewTargetKind = 'course' | 'academy';

export type ReviewItem = {
  id: string;
  targetKind: ReviewTargetKind;
  targetId: string;

  rating: number; // 1..5
  comment?: string | null;

  createdAt: string;
  updatedAt?: string | null;

  userId?: string | null;
  userDisplayName?: string | null;
  userEmailMasked?: string | null;
};

export type ReviewSummary = {
  avgRating: number;
  count: number;
  distribution?: { [k: string]: number } | null;
};

export type ReviewListResponse = {
  summary: ReviewSummary;
  total: number;
  page: number;
  pageSize: number;
  items: ReviewItem[];
  myReview?: ReviewItem | null;
};

export type UpsertReviewPayload = {
  rating: number; // 1..5
  comment?: string | null;
};

/* =========================
   ✅ Certificates (NEW)
========================= */
export type CertificateIssueResponse = {
  id: string;
  certificateNumber: string;
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

  listAcademies(q = '', sort = 'newest') {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (sort) params.set('sort', sort);

    return this.http.get<PublicAcademy[]>(`${this.api}/api/catalog/academies?${params.toString()}`);
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

  /* =========================
     ✅ Certificates API (NEW)
  ========================= */

  issueCertificate(courseId: string) {
    return this.http.post<CertificateIssueResponse>(
      `${this.api}/api/learning/me/courses/${courseId}/certificate/issue`,
      {}
    );
  }

  downloadCertificatePdf(certificateId: string) {
    return this.http.get(`${this.api}/api/learning/me/certificates/${certificateId}/pdf`, {
      responseType: 'blob',
    });
  }

  getMyCertificate(courseId: string) {
    return this.http.get<{ id: string; certificateNumber: string; issuedAt: string }>(
      `${this.api}/api/learning/me/courses/${courseId}/certificate`
    );
  }

  // Quiz
  getLessonQuiz(lessonId: string) {
    return this.http.get<any>(`${this.api}/api/quizzes/student/lesson/${lessonId}`);
  }

  submitQuizAttempt(quizId: string, payload: any) {
    return this.http.post<QuizSubmitResult>(`${this.api}/api/quizzes/${quizId}/attempts`, payload);
  }

  saveQuizDraftAttempt(quizId: string, payload: any) {
    return this.http.post<any>(`${this.api}/api/quizzes/${quizId}/attempts/save`, payload);
  }

  /* =========================
     ✅ Reviews API (NEW)
     NOTE: adjust these routes if your backend differs.
  ========================= */

  listCourseReviews(courseId: string, page = 1, pageSize = 10) {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));
    return this.http.get<ReviewListResponse>(`${this.api}/api/reviews/courses/${courseId}?${params.toString()}`);
  }

  getMyCourseReview(courseId: string) {
    return this.http.get<ReviewItem | null>(`${this.api}/api/reviews/courses/${courseId}/mine`);
  }

  upsertCourseReview(courseId: string, payload: UpsertReviewPayload) {
    return this.http.post<ReviewItem>(`${this.api}/api/reviews/courses/${courseId}`, payload);
  }

  listAcademyReviews(academyId: string, page = 1, pageSize = 10) {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));
    return this.http.get<ReviewListResponse>(`${this.api}/api/reviews/academies/${academyId}?${params.toString()}`);
  }

  getMyAcademyReview(academyId: string) {
    return this.http.get<ReviewItem | null>(`${this.api}/api/reviews/academies/${academyId}/mine`);
  }

  upsertAcademyReview(academyId: string, payload: UpsertReviewPayload) {
    return this.http.post<ReviewItem>(`${this.api}/api/reviews/academies/${academyId}`, payload);
  }

  retakeQuizAttempt(quizId: string) {
    return this.http.post<any>(`${this.api}/api/quizzes/${quizId}/attempts/retake`, {});
  }
}