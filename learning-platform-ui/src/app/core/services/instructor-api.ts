import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type AcademyDto = {
  id: string;
  name: string;
  slug: string;
  description?: string;
  createdAt: string;
  isPublished?: boolean;
  publishedAt?: string | null;
  isHidden?: boolean;
  hiddenReason?: string | null;
  hiddenAt?: string | null;
};

export type CourseDto = {
  id: string;
  title: string;
  status: number;
  isFree: boolean;
  price?: number | null;
  currency: string;
  category?: string | null;
  createdAt: string;
  enrollmentCount?: number;
  isHidden?: boolean;
  hiddenReason?: string | null;
  hiddenAt?: string | null;
  hiddenByUserId?: string | null;
  thumbnailUrl?: string | null;
  shortDescription?: string | null;
  fullDescription?: string | null;
  tagsJson?: string | null;
};

export type AcademyInfo = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  website?: string | null;
  primaryColor?: string | null;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  fontKey?: FontKey | null;
  customFontUrl?: string | null;
  customFontFamily?: string | null;
  isPublished?: boolean;
  publishedAt?: string | null;
  createdAt?: string;
};

export type FontKey =
  | 'system'
  | 'inter'
  | 'poppins'
  | 'cairo'
  | 'tajawal'
  | 'ibmplexar'
  | 'custom';

export type CreateAcademyPayload = {
  name: string;
  slug?: string;
  description?: string;
  website?: string;
  primaryColor?: string;
  fontKey?: FontKey;
  isPublished?: boolean;
};

export type CreateAcademyResponse = {
  id: string;
  slug: string;
};

export type UploadLogoResponse = { logoUrl: string };
export type UploadBannerResponse = { bannerUrl: string };

export type UploadFontResponse = {
  fontKey: 'custom';
  customFontUrl: string;
  customFontFamily: string;
};

export type UpdateBrandingPayload = {
  primaryColor?: string;
  fontKey?: FontKey;
};

export type UpdateCoursePayload = {
  title?: string;
  shortDescription?: string | null;
  fullDescription?: string | null;
  isFree?: boolean;
  price?: number | null;
  currency?: string;
  category?: string | null;
  tagsJson?: string;
};

export type PaymentStatus =
  | 'Pending'
  | 'Paid'
  | 'Failed'
  | 'Cancelled';

export type RevenueTopCourse = {
  courseId: string;
  title: string;
  salesCount: number;
  revenue: number;
};

export type RevenueDailyPoint = {
  date: string;
  revenue: number;
  salesCount: number;
};

export type AcademyRevenueSummary = {
  academyId: string;
  from?: string | null;
  to?: string | null;
  totalRevenue: number;
  totalSales: number;
  totalCustomers: number;
  pendingCount: number;
  failedCount: number;
  cancelledCount: number;
  topCourses: RevenueTopCourse[];
  dailyRevenue: RevenueDailyPoint[];
};

export type RevenueBuyer = {
  id: string;
  email?: string | null;
  displayName?: string | null;
  profileImageUrl?: string | null;
};

export type AcademySaleItem = {
  id: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  provider: string;
  paymentMethodType?: string | null;
  createdAt: string;
  paidAt?: string | null;
  failureReason?: string | null;
  buyer: RevenueBuyer;
  course: {
    courseId: string;
    title: string;
    thumbnailUrl?: string | null;
  };
};

export type AcademySalesResponse = {
  academyId: string;
  total: number;
  page: number;
  pageSize: number;
  items: AcademySaleItem[];
};

export type CourseSaleItem = {
  id: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  provider: string;
  paymentMethodType?: string | null;
  createdAt: string;
  paidAt?: string | null;
  failureReason?: string | null;
  buyer: RevenueBuyer;
};

export type CourseSalesResponse = {
  course: {
    id: string;
    title: string;
    academyId: string;
  };
  total: number;
  page: number;
  pageSize: number;
  totalRevenue: number;
  items: CourseSaleItem[];
};

export type InstructorEarningItem = {
  id: string;
  paymentId: string;
  courseId: string;
  academyId: string;
  grossAmount: number;
  platformAmount: number;
  organizationAmount: number;
  instructorAmount: number;
  currency: string;
  isReleasedForPayout: boolean;
  isPaidOut: boolean;
  earnedAt: string;
  releasedAt?: string | null;
  paidOutAt?: string | null;
  courseTitle: string;
};

export type InstructorEarningsResponse = {
  total: number;
  page: number;
  pageSize: number;
  available: number;
  processing: number;
  paidOut: number;
  items: InstructorEarningItem[];
};

export type RequestPayoutNowResponse = {
  id: string;
  status: string;
  requestedAmount: number;
  currency: string;
  message: string;
};

export type AiQuizGenerationRequest = {
  topic?: string | null;
  instructions?: string | null;
  questionCount: number;
  difficulty: string;
};

export type AiQuizChoiceDto = {
  text: string;
  isCorrect: boolean;
};

export type AiQuizDraftDto = {
  type: number;
  prompt: string;
  points: number;
  choices?: AiQuizChoiceDto[] | null;
  correctAnswerText?: string | null;
  matchType?: number | null;
};

export type AiFlashcardGenerateRequest = {
  topic?: string | null;
  instructions?: string | null;
  count: number;
  difficulty: string;
};

export type FlashcardDto = {
  id?: string | null;
  lessonId?: string;
  question: string;
  answer: string;
  orderIndex: number;
  isPublished: boolean;
};

@Injectable({ providedIn: 'root' })
export class InstructorApi {
  private api = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  getMyAcademies() {
    return this.http.get<AcademyDto[]>(`${this.api}/api/instructor/academies/mine`);
  }

  getAcademy(academyId: string) {
    return this.http.get<AcademyInfo>(`${this.api}/api/instructor/academies/${academyId}`);
  }

  createAcademy(payload: CreateAcademyPayload) {
    return this.http.post<CreateAcademyResponse>(`${this.api}/api/academies`, payload);
  }

  deleteAcademy(academyId: string) {
    return this.http.delete(`${this.api}/api/academies/${academyId}`);
  }

  setAcademyPublish(academyId: string, isPublished: boolean) {
    return this.http.put(`${this.api}/api/academies/${academyId}/publish`, { isPublished });
  }

  uploadAcademyLogo(academyId: string, file: File) {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post<UploadLogoResponse>(`${this.api}/api/academies/${academyId}/logo`, fd);
  }

  uploadAcademyBanner(academyId: string, file: File) {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post<UploadBannerResponse>(`${this.api}/api/academies/${academyId}/banner`, fd);
  }

  uploadAcademyFont(academyId: string, file: File) {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post<UploadFontResponse>(`${this.api}/api/academies/${academyId}/font`, fd);
  }

  updateAcademyBranding(academyId: string, payload: UpdateBrandingPayload) {
    return this.http.put(`${this.api}/api/academies/${academyId}/branding`, payload);
  }

  listCourses(academyId: string) {
    return this.http.get<CourseDto[]>(`${this.api}/api/courses/academy/${academyId}`);
  }

  createCourse(payload: any) {
    return this.http.post<{ id: string }>(`${this.api}/api/courses`, payload);
  }

  uploadCourseThumbnail(courseId: string, file: File) {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post<{ thumbnailUrl: string }>(`${this.api}/api/courses/${courseId}/thumbnail`, fd);
  }

  deleteCourseThumbnail(courseId: string) {
    return this.http.delete<void>(`${this.api}/api/courses/${courseId}/thumbnail`);
  }

  publishCourse(courseId: string) {
    return this.http.post(`${this.api}/api/courses/${courseId}/publish`, {});
  }

  getCourse(courseId: string) {
    return this.http.get<any>(`${this.api}/api/courses/${courseId}`);
  }

  updateCourse(courseId: string, payload: UpdateCoursePayload) {
    return this.http.put<any>(`${this.api}/api/courses/${courseId}`, payload);
  }

  deleteCourse(courseId: string) {
    return this.http.delete(`${this.api}/api/courses/${courseId}`);
  }

  updateCourseStatus(courseId: string, status: number) {
    return this.http.put(`${this.api}/api/courses/${courseId}/status`, { status });
  }

  getCourseEnrollments(courseId: string) {
    return this.http.get<any>(`${this.api}/api/courses/${courseId}/enrollments`);
  }

  addModule(courseId: string, payload: { title: string }) {
    return this.http.post<{ id: string }>(`${this.api}/api/courses/${courseId}/modules`, payload);
  }

  deleteModule(moduleId: string) {
    return this.http.delete(`${this.api}/api/courses/modules/${moduleId}`);
  }

  addLesson(
    moduleId: string,
    payload: {
      title: string;
      type: number;
      contentUrl?: string | null;
      htmlContent?: string | null;
      isPreviewFree: boolean;
      isDownloadable: boolean;
    }
  ) {
    return this.http.post<{ id: string }>(`${this.api}/api/courses/modules/${moduleId}/lessons`, payload);
  }

  uploadLessonVideo(lessonId: string, file: File) {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post<{ contentUrl: string }>(
      `${this.api}/api/courses/lessons/${lessonId}/upload-video`,
      fd
    );
  }

  uploadLessonFile(lessonId: string, file: File) {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post<{ contentUrl: string }>(
      `${this.api}/api/courses/lessons/${lessonId}/upload-file`,
      fd
    );
  }

  deleteLesson(lessonId: string) {
    return this.http.delete(`${this.api}/api/courses/lessons/${lessonId}`);
  }

  reorderModules(courseId: string, orderedIds: string[]) {
    return this.http.put(`${this.api}/api/courses/${courseId}/modules/reorder`, { orderedIds });
  }

  reorderLessons(moduleId: string, orderedIds: string[]) {
    return this.http.put(`${this.api}/api/courses/modules/${moduleId}/lessons/reorder`, { orderedIds });
  }

  getLessonQuiz(lessonId: string) {
    return this.http.get<any>(`${this.api}/api/quizzes/lesson/${lessonId}`);
  }

  upsertLessonQuiz(lessonId: string, payload: any) {
    return this.http.put(`${this.api}/api/quizzes/lesson/${lessonId}`, payload);
  }

  generateLessonQuizWithAi(lessonId: string, payload: AiQuizGenerationRequest) {
    return this.http.post<AiQuizDraftDto[]>(
      `${this.api}/api/ai/lessons/${lessonId}/quiz/generate`,
      payload
    );
  }

  generateLessonFlashcardsWithAi(lessonId: string, payload: AiFlashcardGenerateRequest) {
    return this.http.post<FlashcardDto[]>(
      `${this.api}/api/ai/lessons/${lessonId}/flashcards/generate`,
      payload
    );
  }

  getLessonFlashcards(lessonId: string) {
    return this.http.get<FlashcardDto[]>(
      `${this.api}/api/flashcards/lesson/${lessonId}`
    );
  }

  upsertLessonFlashcards(lessonId: string, payload: FlashcardDto[]) {
    return this.http.put<FlashcardDto[]>(
      `${this.api}/api/flashcards/lesson/${lessonId}`,
      payload
    );
  }

  publishLessonFlashcards(lessonId: string) {
    return this.http.post<FlashcardDto[]>(
      `${this.api}/api/flashcards/lesson/${lessonId}/publish`,
      {}
    );
  }

  unpublishLessonFlashcards(lessonId: string) {
    return this.http.post<FlashcardDto[]>(
      `${this.api}/api/flashcards/lesson/${lessonId}/unpublish`,
      {}
    );
  }

  getAcademyRevenueSummary(academyId: string, from?: string | null, to?: string | null) {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);

    const suffix = params.toString() ? `?${params.toString()}` : '';
    return this.http.get<AcademyRevenueSummary>(
      `${this.api}/api/payments/instructor/academy/${academyId}/summary${suffix}`
    );
  }

  getAcademySales(
    academyId: string,
    status = '',
    courseId = '',
    page = 1,
    pageSize = 20
  ) {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (courseId) params.set('courseId', courseId);
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));

    return this.http.get<AcademySalesResponse>(
      `${this.api}/api/payments/instructor/academy/${academyId}/sales?${params.toString()}`
    );
  }

  getCourseSales(courseId: string, status = '', page = 1, pageSize = 20) {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));

    return this.http.get<CourseSalesResponse>(
      `${this.api}/api/payments/instructor/course/${courseId}/sales?${params.toString()}`
    );
  }

  getInstructorEarnings(academyId = '', page = 1, pageSize = 20) {
    const params = new URLSearchParams();
    if (academyId) params.set('academyId', academyId);
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));

    return this.http.get<InstructorEarningsResponse>(
      `${this.api}/api/payments/instructor/me/earnings?${params.toString()}`
    );
  }

  requestPayoutNow(academyId: string, note?: string | null) {
    return this.http.post<RequestPayoutNowResponse>(
      `${this.api}/api/payments/instructor/me/request-now`,
      {
        academyId,
        note: note ?? null
      }
    );
  }
}