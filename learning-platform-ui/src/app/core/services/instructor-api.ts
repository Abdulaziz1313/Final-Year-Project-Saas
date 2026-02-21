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

  // ✅ moderation fields (admin hide)
  isHidden?: boolean;
  hiddenReason?: string | null;
  hiddenAt?: string | null;
  hiddenByUserId?: string | null;

  // optional if you already return it
  thumbnailUrl?: string | null;
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


export type FontKey = 'system' | 'inter' | 'poppins' | 'cairo' | 'tajawal' | 'ibmplexar' | 'custom';

export type CreateAcademyPayload = {
  name: string;
  slug?: string;
  description?: string;
  website?: string;
  primaryColor?: string;
  fontKey?: FontKey;
  isPublished?: boolean; // ✅ NEW
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

@Injectable({ providedIn: 'root' })
export class InstructorApi {
  private api = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  // Academies
  getMyAcademies() {
    return this.http.get<AcademyDto[]>(`${this.api}/api/instructor/academies/mine`);
  }

  createAcademy(payload: CreateAcademyPayload) {
    return this.http.post<CreateAcademyResponse>(`${this.api}/api/academies`, payload);
  }

  deleteAcademy(academyId: string) {
    return this.http.delete(`${this.api}/api/academies/${academyId}`);
  }

  // ✅ Publish/unpublish academy
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

  // ✅ upload custom font file
  uploadAcademyFont(academyId: string, file: File) {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post<UploadFontResponse>(`${this.api}/api/academies/${academyId}/font`, fd);
  }

  // ✅ update branding (color + font selection)
  updateAcademyBranding(academyId: string, payload: UpdateBrandingPayload) {
    return this.http.put(`${this.api}/api/academies/${academyId}/branding`, payload);
  }

  // Courses
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

  publishCourse(courseId: string) {
    return this.http.post(`${this.api}/api/courses/${courseId}/publish`, {});
  }

  getCourse(courseId: string) {
    return this.http.get<any>(`${this.api}/api/courses/${courseId}`);
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

  // Modules & lessons
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
    return this.http.post<{ contentUrl: string }>(`${this.api}/api/courses/lessons/${lessonId}/upload-video`, fd);
  }

  uploadLessonFile(lessonId: string, file: File) {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post<{ contentUrl: string }>(`${this.api}/api/courses/lessons/${lessonId}/upload-file`, fd);
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
getAcademy(academyId: string) {
  return this.http.get<AcademyInfo>(`${this.api}/api/instructor/academies/${academyId}`);
}


getLessonQuiz(lessonId: string) {
  return this.http.get<any>(`${this.api}/api/quizzes/lesson/${lessonId}`);
}

upsertLessonQuiz(lessonId: string, payload: any) {
  return this.http.put(`${this.api}/api/quizzes/lesson/${lessonId}`, payload);
}



}
