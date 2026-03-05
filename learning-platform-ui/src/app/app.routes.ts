// app.routes.ts — full updated file
import { Routes } from '@angular/router';

import { AuthLayoutComponent } from './layout/auth-layout/auth-layout';
import { PublicLayoutComponent } from './layout/public-layout/public-layout';
import { AppShellComponent } from './layout/app-shell/app-shell';

import { LoginComponent } from './features/auth/login/login';
import { RegisterComponent } from './features/auth/register/register';
import { RegisterInstructorComponent } from './features/auth/register-instructor/register-instructor';
import { RegisterStudentComponent } from './features/auth/register-student/register-student';
import { LoginAcademyComponent } from './features/auth/login-academy/login-academy';

import { MeComponent } from './features/me/me';
import { instructorGuard } from './core/guards/instructor.guard';
import { studentGuard } from './core/guards/student.guard';
import { adminGuard } from './core/guards/admin.guard';
import { orgAdminGuard } from './core/guards/org-admin.guard';
import { OrgGuard } from './core/guards/org.guard';

import { DashboardComponent } from './features/instructor/dashboard/dashboard';
import { CoursesComponent } from './features/instructor/courses/courses';
import { CourseCreateComponent } from './features/instructor/course-create/course-create';
import { CourseBuilderComponent } from './features/instructor/course-builder/course-builder';
import { CourseEnrollmentsComponent } from './features/instructor/course-enrollments/course-enrollments';
import { InstructorAcademiesManageComponent } from './features/instructor/academies-manage/academies-manage';
import { QuizEditorComponent } from './features/instructor/quiz-editor/quiz-editor';

import { OrgAcademiesComponent } from './features/org/org-academies/org-academies';
import { OrgAcademyCreateComponent } from './features/org/org-academy-create/org-academy-create';
import { OrgMembersPage } from './features/org/members/org-members';

import { AcademiesComponent } from './features/student/academies/academies';
import { AcademyCatalogComponent } from './features/student/academy-catalog/academy-catalog';
import { CoursePublicComponent } from './features/student/course-public/course-public';
import { MyLearningComponent } from './features/student/my-learning/my-learning';
import { PlayerComponent } from './features/student/player/player';

import { HomeComponent } from './features/public/home/home';
import { AdminComponent } from './features/admin/admin';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'home' },

  // ── Standalone public registration / login pages (no layout wrapper) ──
  { path: 'register-instructor', component: RegisterInstructorComponent },
  { path: 'register-student',    component: RegisterStudentComponent },
  { path: 'login-academy',       component: LoginAcademyComponent },

  // ── Auth layout (no sidebar) ──────────────────────────────────────────
  {
    path: '',
    component: AuthLayoutComponent,
    children: [
      { path: 'login',    component: LoginComponent },
      { path: 'register', component: RegisterComponent },
    ],
  },

  // ── Public layout (no sidebar) ────────────────────────────────────────
  {
    path: '',
    component: PublicLayoutComponent,
    children: [
      { path: 'home',           component: HomeComponent },
      { path: 'academies',      component: AcademiesComponent },
      { path: 'academy/:slug',  component: AcademyCatalogComponent },
      { path: 'course/:id',     component: CoursePublicComponent },
    ],
  },

  // ── App shell (sidebar) ───────────────────────────────────────────────
  {
    path: '',
    component: AppShellComponent,
    children: [
      { path: 'me', component: MeComponent },

      // ── OrgAdmin routes ───────────────────────────────────────────────
      { path: 'org/academies',        component: OrgAcademiesComponent,     canActivate: [orgAdminGuard] },
      { path: 'org/academies/create', component: OrgAcademyCreateComponent, canActivate: [orgAdminGuard] },
      { path: 'org/members',          component: OrgMembersPage,            canActivate: [orgAdminGuard] },

      // ── Instructor routes ─────────────────────────────────────────────
      { path: 'instructor',                              component: DashboardComponent,                 canActivate: [instructorGuard, OrgGuard] },
      { path: 'instructor/courses/:academyId',           component: CoursesComponent,                  canActivate: [instructorGuard, OrgGuard] },
      { path: 'instructor/course/create/:academyId',     component: CourseCreateComponent,             canActivate: [instructorGuard, OrgGuard] },
      { path: 'instructor/course-builder/:courseId',     component: CourseBuilderComponent,            canActivate: [instructorGuard, OrgGuard] },
      { path: 'instructor/course-enrollments/:courseId', component: CourseEnrollmentsComponent,        canActivate: [instructorGuard, OrgGuard] },
      { path: 'instructor/academies',                    component: InstructorAcademiesManageComponent, canActivate: [instructorGuard, OrgGuard] },
      { path: 'instructor/lessons/:lessonId/quiz',       component: QuizEditorComponent,               canActivate: [instructorGuard, OrgGuard] },

      // ── Student routes ────────────────────────────────────────────────
      { path: 'my-learning',     component: MyLearningComponent, canActivate: [studentGuard] },
      { path: 'learn/:courseId', component: PlayerComponent,     canActivate: [studentGuard] },

      // ── Admin ─────────────────────────────────────────────────────────
      { path: 'admin', component: AdminComponent, canActivate: [adminGuard] },
    ],
  },

  { path: '**', redirectTo: 'home' },
];