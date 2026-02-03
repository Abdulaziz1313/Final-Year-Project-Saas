import { Routes } from '@angular/router';

import { AuthLayoutComponent } from './layout/auth-layout/auth-layout';
import { PublicLayoutComponent } from './layout/public-layout/public-layout';
import { AppShellComponent } from './layout/app-shell/app-shell';

import { LoginComponent } from './features/auth/login/login';
import { RegisterComponent } from './features/auth/register/register';

import { MeComponent } from './features/me/me';
import { instructorGuard } from './core/guards/instructor.guard';
import { studentGuard } from './core/guards/student.guard';

import { DashboardComponent } from './features/instructor/dashboard/dashboard';
import { AcademyCreateComponent } from './features/instructor/academy-create/academy-create';
import { CoursesComponent } from './features/instructor/courses/courses';
import { CourseCreateComponent } from './features/instructor/course-create/course-create';
import { CourseBuilderComponent } from './features/instructor/course-builder/course-builder';
import { CourseEnrollmentsComponent } from './features/instructor/course-enrollments/course-enrollments';

// Student pages (public)
import { AcademiesComponent } from './features/student/academies/academies';
import { AcademyCatalogComponent } from './features/student/academy-catalog/academy-catalog';
import { CoursePublicComponent } from './features/student/course-public/course-public';

// Student pages (shell)
import { MyLearningComponent } from './features/student/my-learning/my-learning';
import { PlayerComponent } from './features/student/player/player';

// ✅ NEW: Home page (create this component)
import { HomeComponent } from './features/public/home/home';
import { adminGuard } from './core/guards/admin.guard';
import { AdminComponent } from './features/admin/admin';






export const routes: Routes = [
  // ✅ Default goes to Home now
  { path: '', pathMatch: 'full', redirectTo: 'home' },

  // Auth (no sidebar)
  {
    path: '',
    component: AuthLayoutComponent,
    children: [
      { path: 'login', component: LoginComponent },
      { path: 'register', component: RegisterComponent },
    ],
  },

  // Public (no sidebar) — must be BEFORE AppShell
  {
    path: '',
    component: PublicLayoutComponent,
    children: [
      // ✅ Home route
      { path: 'home', component: HomeComponent },

      // Public catalog
      { path: 'academies', component: AcademiesComponent },
      { path: 'academy/:slug', component: AcademyCatalogComponent },
      { path: 'course/:id', component: CoursePublicComponent },
    ],
  },

  // AppShell (sidebar)
  {
    path: '',
    component: AppShellComponent,
    children: [
      { path: 'me', component: MeComponent },

      // instructor
      { path: 'instructor', component: DashboardComponent, canActivate: [instructorGuard] },
      { path: 'instructor/academy/create', component: AcademyCreateComponent, canActivate: [instructorGuard] },
      { path: 'instructor/courses/:academyId', component: CoursesComponent, canActivate: [instructorGuard] },
      { path: 'instructor/course/create/:academyId', component: CourseCreateComponent, canActivate: [instructorGuard] },
      { path: 'instructor/course-builder/:courseId', component: CourseBuilderComponent, canActivate: [instructorGuard] },
      { path: 'instructor/course-enrollments/:courseId', component: CourseEnrollmentsComponent, canActivate: [instructorGuard] },

      // student (shell only)
      { path: 'my-learning', component: MyLearningComponent, canActivate: [studentGuard] },
      { path: 'learn/:courseId', component: PlayerComponent, canActivate: [studentGuard] },
      { path: 'admin', component: AdminComponent, canActivate: [adminGuard] },
      
      
    ],
  },

  // ✅ Unknown routes go Home (not login)
  { path: '**', redirectTo: 'home' },
];
