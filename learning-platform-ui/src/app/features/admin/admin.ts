import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, FormGroup, FormControl } from '@angular/forms';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

import { AdminApi } from '../../core/services/admin-api';
import { ToastService } from '../../shared/ui/toast.service';

type Tab = 'academies' | 'courses' | 'users';

type AdminFilters = {
  q: FormControl<string>;
  status: FormControl<string>;
  role: FormControl<string>;
};

type HideTargetKind = 'academy' | 'course';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './admin.html',
  styleUrl: './admin.scss',
})
export class AdminComponent {
  tab: Tab = 'academies';

  loading = false;
  error: string | null = null;

  academies: any[] = [];
  courses: any[] = [];
  users: any[] = [];

  // pagination
  page = 1;
  pageSize = 25;
  total = 0;

  // per-item busy state
  busy = new Set<string>();

  form!: FormGroup<AdminFilters>;

  // ✅ Moderation drawer state
  hideOpen = false;
  hideKind: HideTargetKind = 'academy';
  hideId: string | null = null;
  hideTitle: string | null = null;

  reasonCtrl!: FormControl<string>;

  quickReasons = [
    'Sexual content',
    'Hate or harassment',
    'Spam or scam',
    'Copyright',
    'Other',
  ];

  constructor(private api: AdminApi, private fb: FormBuilder, private toast: ToastService) {
    this.form = this.fb.group<AdminFilters>({
      q: this.fb.control('', { nonNullable: true }),
      status: this.fb.control('all', { nonNullable: true }),
      role: this.fb.control('all', { nonNullable: true }),
    });

    this.reasonCtrl = this.fb.control('Policy violation', { nonNullable: true });

    // Debounced auto-apply
    this.form.valueChanges.pipe(debounceTime(350), distinctUntilChanged()).subscribe(() => {
      this.page = 1;
      this.load();
    });

    this.load();
  }

  // Pagination helpers
  get totalPages(): number {
    const pages = Math.ceil((this.total || 0) / (this.pageSize || 1));
    return Math.max(1, pages);
  }

  get canPrev() {
    return this.page > 1;
  }

  get canNext() {
    return this.page * this.pageSize < this.total;
  }

  nextPage() {
    if (!this.canNext) return;
    this.page += 1;
    this.load();
  }

  prevPage() {
    if (!this.canPrev) return;
    this.page -= 1;
    this.load();
  }

  isBusy(id: string) {
    return this.busy.has(id);
  }

  private setLoading(v: boolean) {
    this.loading = v;
    if (v) this.error = null;
  }

  setTab(t: Tab) {
    this.tab = t;
    this.page = 1;
    this.total = 0;

    this.closeHideDrawer();
    this.form.patchValue({ q: '', status: 'all', role: 'all' }, { emitEvent: false });
    this.load();
  }

  apply() {
    this.page = 1;
    this.load();
  }

  load() {
    this.setLoading(true);

    const fv = this.form.getRawValue();
    const q = (fv.q || '').trim();
    const status = fv.status || 'all';
    const role = fv.role || 'all';

    if (this.tab === 'academies') {
      this.api.listAcademies(q, status, this.page, this.pageSize).subscribe({
        next: (res) => {
          this.academies = res.items || [];
          this.total = res.total ?? this.academies.length;
          this.setLoading(false);
        },
        error: () => {
          this.error = 'Failed to load academies.';
          this.setLoading(false);
        }
      });
      return;
    }

    if (this.tab === 'courses') {
      this.api.listCourses(q, status, this.page, this.pageSize).subscribe({
        next: (res) => {
          this.courses = res.items || [];
          this.total = res.total ?? this.courses.length;
          this.setLoading(false);
        },
        error: () => {
          this.error = 'Failed to load courses.';
          this.setLoading(false);
        }
      });
      return;
    }

    // users
    this.api.listUsers(q, role, this.page, this.pageSize).subscribe({
      next: (res) => {
        this.users = res.items || [];
        this.total = res.total ?? this.users.length;
        this.setLoading(false);
      },
      error: () => {
        this.error = 'Failed to load users.';
        this.setLoading(false);
      }
    });
  }

  // ---------------- Moderation Drawer ----------------
  openHideDrawer(kind: HideTargetKind, id: string, title: string, existingReason?: string | null) {
    if (this.isBusy(id)) return;

    this.hideOpen = true;
    this.hideKind = kind;
    this.hideId = id;
    this.hideTitle = title;

    // default reason
    this.reasonCtrl.setValue((existingReason || 'Policy violation').trim());
  }

  closeHideDrawer() {
    this.hideOpen = false;
    this.hideId = null;
    this.hideTitle = null;
    this.reasonCtrl.setValue('Policy violation');
  }

  pickReason(r: string) {
    this.reasonCtrl.setValue(r);
  }

  confirmHide() {
    const id = this.hideId;
    if (!id) return;

    const reason = (this.reasonCtrl.value || '').trim();
    const safeReason = reason.length ? reason : 'Policy violation';

    this.busy.add(id);

    if (this.hideKind === 'academy') {
      this.api.moderateAcademy(id, true, safeReason).subscribe({
        next: () => {
          this.busy.delete(id);
          this.toast.success('Academy hidden.');
          this.closeHideDrawer();
          this.load();
        },
        error: () => {
          this.busy.delete(id);
          this.toast.error('Update failed.');
        }
      });
      return;
    }

    this.api.moderateCourse(id, true, safeReason).subscribe({
      next: () => {
        this.busy.delete(id);
        this.toast.success('Course hidden.');
        this.closeHideDrawer();
        this.load();
      },
      error: () => {
        this.busy.delete(id);
        this.toast.error('Update failed.');
      }
    });
  }

  // ---------------- Unhide (no reason needed) ----------------
  unhideAcademy(a: any) {
    if (this.isBusy(a.id)) return;
    this.busy.add(a.id);

    this.api.moderateAcademy(a.id, false, null).subscribe({
      next: () => {
        this.busy.delete(a.id);
        this.toast.success('Academy unhidden.');
        this.closeHideDrawer();
        this.load();
      },
      error: () => {
        this.busy.delete(a.id);
        this.toast.error('Update failed.');
      }
    });
  }

  unhideCourse(c: any) {
    if (this.isBusy(c.id)) return;
    this.busy.add(c.id);

    this.api.moderateCourse(c.id, false, null).subscribe({
      next: () => {
        this.busy.delete(c.id);
        this.toast.success('Course unhidden.');
        this.closeHideDrawer();
        this.load();
      },
      error: () => {
        this.busy.delete(c.id);
        this.toast.error('Update failed.');
      }
    });
  }

  // ---------------- Users ----------------
  toggleLock(u: any) {
    if (this.isBusy(u.id)) return;
    const locked = !!u.lockoutEnd;

    this.busy.add(u.id);
    this.api.setUserLock(u.id, !locked).subscribe({
      next: () => {
        this.busy.delete(u.id);
        this.toast.success(!locked ? 'User locked.' : 'User unlocked.');
        this.load();
      },
      error: () => {
        this.busy.delete(u.id);
        this.toast.error('Update failed.');
      }
    });
  }

  setRoles(u: any) {
    if (this.isBusy(u.id)) return;

    const current = (u.roles || []).join(', ');
    const input = prompt('Set roles (comma-separated). Example: Student,Instructor,Admin', current);
    if (input == null) return;

    const roles = input.split(',').map(x => x.trim()).filter(Boolean);

    this.busy.add(u.id);
    this.api.setUserRoles(u.id, roles).subscribe({
      next: () => {
        this.busy.delete(u.id);
        this.toast.success('Roles updated.');
        this.load();
      },
      error: () => {
        this.busy.delete(u.id);
        this.toast.error('Update failed.');
      }
    });
  }
}
