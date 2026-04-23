import { Routes } from '@angular/router';

import { AuthLayoutComponent } from './layout/auth-layout/auth-layout';
import { PublicLayoutComponent } from './layout/public-layout/public-layout';
import { AppShellComponent } from './layout/app-shell/app-shell';

import { LoginComponent } from './features/auth/login/login';
import { RegisterComponent } from './features/auth/register/register';
import { RegisterStudentComponent } from './features/auth/register-student/register-student';
import { LoginAcademyComponent } from './features/auth/login-academy/login-academy';
import { LoginInstructorComponent } from './features/auth/login-instructor/login-instructor';

import { ForgotPasswordComponent } from './features/auth/forgot-password/forgot-password';
import { ResetPasswordComponent } from './features/auth/reset-password/reset-password';
import { FirstLoginPasswordComponent } from './features/auth/first-login-password/first-login-password';

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
import { FlashcardsEditorComponent } from './features/instructor/flashcards-editor/flashcards-editor';
import { RevenueComponent } from './features/instructor/revenue/revenue';
import { CourseSalesComponent } from './features/instructor/course-sales/course-sales';
import { EarningsComponent } from './features/instructor/earnings/earnings';

import { OrgAcademiesComponent } from './features/org/org-academies/org-academies';
import { OrgAcademyCreateComponent } from './features/org/org-academy-create/org-academy-create';
import { OrgAcademyEditComponent } from './features/org/org-academy-edit/org-academy-edit';
import { OrgMembersPage } from './features/org/members/org-members';
import { OrgPayoutsComponent } from './features/org/payouts/org-payouts';
import { OrgPayoutSettingsComponent } from './features/org/payouts-settings/org-payouts-settings';

import { AcademiesComponent } from './features/student/academies/academies';
import { AcademyCatalogComponent } from './features/student/academy-catalog/academy-catalog';
import { CoursePublicComponent } from './features/student/course-public/course-public';
import { MyLearningComponent } from './features/student/my-learning/my-learning';
import { PlayerComponent } from './features/student/player/player';
import { CheckoutSuccessComponent } from './features/student/checkout-success/checkout-success';
import { CheckoutCancelComponent } from './features/student/checkout-cancel/checkout-cancel';
import { PurchasesComponent } from './features/student/purchases/purchases';
import { PurchaseDetailComponent } from './features/student/purchase-detail/purchase-detail';

import { HomeComponent } from './features/public/home/home';
import { OrgPublicHomeComponent } from './features/public/org-public-home/org-public-home';
import { AdminComponent } from './features/admin/admin';
import { AdminCourseLessonsComponent } from './features/admin/admin-course-lessons/admin-course-lessons';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'home' },

  { path: 'register-student', component: RegisterStudentComponent },
  { path: 'login-academy', component: LoginAcademyComponent },
  { path: 'login-instructor', component: LoginInstructorComponent },

  { path: 'first-login-password', component: FirstLoginPasswordComponent },

  { path: 'forgot-password', component: ForgotPasswordComponent },
  { path: 'reset-password', component: ResetPasswordComponent },

  {
    path: '',
    component: AuthLayoutComponent,
    children: [
      { path: 'login', component: LoginComponent },
      { path: 'register', component: RegisterComponent },
    ],
  },

  {
    path: '',
    component: PublicLayoutComponent,
    children: [
      { path: 'home', component: HomeComponent },
      { path: 'academies', component: AcademiesComponent },

      { path: 'academy/:slug', component: AcademyCatalogComponent },

      { path: 'academy-home/:slug', component: OrgPublicHomeComponent },

      { path: 'course/:id', component: CoursePublicComponent },
      { path: 'checkout/success', component: CheckoutSuccessComponent },
      { path: 'checkout/cancel', component: CheckoutCancelComponent },
    ],
  },

  {
    path: '',
    component: AppShellComponent,
    children: [
      { path: 'me', component: MeComponent },

      { path: 'org/academies', component: OrgAcademiesComponent, canActivate: [orgAdminGuard, OrgGuard] },
      { path: 'org/academies/create', component: OrgAcademyCreateComponent, canActivate: [orgAdminGuard, OrgGuard] },
      { path: 'org/academies/:academyId/edit', component: OrgAcademyEditComponent, canActivate: [orgAdminGuard, OrgGuard] },
      { path: 'org/members', component: OrgMembersPage, canActivate: [orgAdminGuard, OrgGuard] },
      { path: 'org/payouts/:academyId', component: OrgPayoutsComponent, canActivate: [orgAdminGuard, OrgGuard] },
      { path: 'org/payout-settings/:academyId', component: OrgPayoutSettingsComponent, canActivate: [orgAdminGuard, OrgGuard] },

      { path: 'instructor', component: DashboardComponent, canActivate: [instructorGuard, OrgGuard] },
      { path: 'instructor/courses/:academyId', component: CoursesComponent, canActivate: [instructorGuard, OrgGuard] },
      { path: 'instructor/course/create/:academyId', component: CourseCreateComponent, canActivate: [instructorGuard, OrgGuard] },
      { path: 'instructor/course-builder/:courseId', component: CourseBuilderComponent, canActivate: [instructorGuard, OrgGuard] },
      { path: 'instructor/course-enrollments/:courseId', component: CourseEnrollmentsComponent, canActivate: [instructorGuard, OrgGuard] },
      { path: 'instructor/academies', component: InstructorAcademiesManageComponent, canActivate: [instructorGuard, OrgGuard] },
      { path: 'instructor/lessons/:lessonId/quiz', component: QuizEditorComponent, canActivate: [instructorGuard, OrgGuard] },
      { path: 'instructor/lessons/:lessonId/flashcards', component: FlashcardsEditorComponent, canActivate: [instructorGuard, OrgGuard] },
      { path: 'instructor/revenue/:academyId', component: RevenueComponent, canActivate: [instructorGuard, OrgGuard] },
      { path: 'instructor/course-sales/:courseId', component: CourseSalesComponent, canActivate: [instructorGuard, OrgGuard] },
      { path: 'instructor/earnings/:academyId', component: EarningsComponent, canActivate: [instructorGuard, OrgGuard] },

      { path: 'my-learning', component: MyLearningComponent, canActivate: [studentGuard] },
      { path: 'learn/:courseId', component: PlayerComponent, canActivate: [studentGuard] },
      { path: 'purchases', component: PurchasesComponent, canActivate: [studentGuard] },
      { path: 'purchases/:paymentId', component: PurchaseDetailComponent, canActivate: [studentGuard] },

      { path: 'admin', component: AdminComponent, canActivate: [adminGuard] },
      { path: 'admin/courses/:courseId/lessons', component: AdminCourseLessonsComponent, canActivate: [adminGuard] },
    ],
  },

  { path: '**', redirectTo: 'home' },
];