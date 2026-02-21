import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, FormGroup, FormControl } from '@angular/forms';
import { debounceTime, distinctUntilChanged, map } from 'rxjs/operators';

import { AdminApi } from '../../core/services/admin-api';
import { ToastService } from '../../shared/ui/toast.service';
import { ConfirmService } from '../../shared/ui/confirm.service';

type Tab = 'academies' | 'courses' | 'users' | 'audit';
type HideTargetKind = 'academy' | 'course';
type DeleteTargetKind = 'academy' | 'course';

type AdminFilters = {
  q: FormControl<string>;
  status: FormControl<string>;
  role: FormControl<string>;
};

type AcademyItem = {
  id: string;
  name: string;
  slug: string;
  ownerUserId: string;
  isPublished: boolean;
  isHidden: boolean;
  hiddenReason?: string | null;
  hiddenAt?: string | null;
};

type CourseItem = {
  id: string;
  title: string;
  academyId: string;
  category?: string | null;
  status: number; // 0 draft, 1 published, 2 private
  isHidden: boolean;
  hiddenReason?: string | null;
  hiddenAt?: string | null;
};

type UserItem = {
  id: string;
  email: string;
  displayName?: string | null;
  roles?: string[];
  lockoutEnd?: string | null;
};

type AuditItem = {
  id: string;
  actorUserId: string;
  action: string;
  targetType: string; // academy | course | user
  targetId: string;
  targetLabel?: string | null;
  reason?: string | null;
  metaJson?: string | null;
  createdAt: string;
};

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './admin.html',
  styleUrl: './admin.scss',
})
export class AdminComponent {
  tab: Tab = 'academies';

  loading = false;
  error: string | null = null;

  academies: AcademyItem[] = [];
  courses: CourseItem[] = [];
  users: UserItem[] = [];
  audit: AuditItem[] = [];

  // pagination
  page = 1;
  pageSize = 25;
  total = 0;

  // per-item busy state
  busy = new Set<string>();

  form!: FormGroup<AdminFilters>;

  // ✅ Audit filters
  auditActionCtrl!: FormControl<string>;
  auditTargetCtrl!: FormControl<string>;

  // Moderation drawer
  hideOpen = false;
  hideKind: HideTargetKind = 'academy';
  hideId: string | null = null;
  hideTitle: string | null = null;
  reasonCtrl!: FormControl<string>;
  quickReasons = ['Sexual content', 'Hate or harassment', 'Spam or scam', 'Copyright', 'Other'];

  // Roles drawer
  rolesOpen = false;
  rolesUser: UserItem | null = null;
  rolesSelected = new Set<string>();
  rolesSaving = false;

  roleOptions: Array<'Student' | 'Instructor' | 'Admin' | 'Coordinator'> = ['Student', 'Instructor', 'Admin', 'Coordinator'];

  // Lock drawer
  lockOpen = false;
  lockUser: UserItem | null = null;
  lockPreset: '1d' | '7d' | '30d' | 'perm' = '7d';
  lockSaving = false;

  // ✅ Delete drawer
  deleteOpen = false;
  deleteKind: DeleteTargetKind = 'academy';
  deleteId: string | null = null;
  deleteTitle: string | null = null;
  deleteReasonCtrl!: FormControl<string>;
  deleteQuickReasons = ['Policy violation', 'Spam or scam', 'Copyright infringement', 'Illegal content', 'Other'];

  constructor(
    private api: AdminApi,
    private fb: FormBuilder,
    private toast: ToastService,
    private confirm: ConfirmService
  ) {
    this.form = this.fb.group<AdminFilters>({
      q: this.fb.control('', { nonNullable: true }),
      status: this.fb.control('all', { nonNullable: true }),
      role: this.fb.control('all', { nonNullable: true }),
    });

    this.auditActionCtrl = this.fb.control('all', { nonNullable: true });
    this.auditTargetCtrl = this.fb.control('all', { nonNullable: true });

    this.reasonCtrl = this.fb.control('Policy violation', { nonNullable: true });
    this.deleteReasonCtrl = this.fb.control('Policy violation', { nonNullable: true });

    // ✅ reload when base filters change
    this.form.valueChanges
      .pipe(debounceTime(350), map((v) => JSON.stringify(v)), distinctUntilChanged())
      .subscribe(() => {
        this.page = 1;
        this.load();
      });

    // ✅ reload when audit filters change (only on audit tab)
    this.auditActionCtrl.valueChanges
      .pipe(debounceTime(250), distinctUntilChanged())
      .subscribe(() => {
        if (this.tab !== 'audit') return;
        this.page = 1;
        this.load();
      });

    this.auditTargetCtrl.valueChanges
      .pipe(debounceTime(250), distinctUntilChanged())
      .subscribe(() => {
        if (this.tab !== 'audit') return;
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
    this.closeRolesDrawer();
    this.closeLockDrawer();
    this.closeDeleteDrawer();

    // reset filters (do not trigger valueChanges)
    this.form.patchValue({ q: '', status: 'all', role: 'all' }, { emitEvent: false });
    this.auditActionCtrl.setValue('all', { emitEvent: false });
    this.auditTargetCtrl.setValue('all', { emitEvent: false });

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
          this.academies = (res.items || []) as AcademyItem[];
          this.total = res.total ?? this.academies.length;
          this.setLoading(false);
        },
        error: () => {
          this.error = 'Failed to load academies.';
          this.setLoading(false);
        },
      });
      return;
    }

    if (this.tab === 'courses') {
      this.api.listCourses(q, status, this.page, this.pageSize).subscribe({
        next: (res) => {
          this.courses = (res.items || []) as CourseItem[];
          this.total = res.total ?? this.courses.length;
          this.setLoading(false);
        },
        error: () => {
          this.error = 'Failed to load courses.';
          this.setLoading(false);
        },
      });
      return;
    }

    if (this.tab === 'users') {
      this.api.listUsers(q, role, this.page, this.pageSize).subscribe({
        next: (res) => {
          this.users = (res.items || []) as UserItem[];
          this.total = res.total ?? this.users.length;
          this.setLoading(false);
        },
        error: () => {
          this.error = 'Failed to load users.';
          this.setLoading(false);
        },
      });
      return;
    }

    // ✅ audit
    const action = (this.auditActionCtrl.value || 'all').trim();
    const targetType = (this.auditTargetCtrl.value || 'all').trim();

    this.api.listAudit(q, action, targetType, this.page, this.pageSize).subscribe({
      next: (res) => {
        this.audit = (res.items || []) as AuditItem[];
        this.total = res.total ?? this.audit.length;
        this.setLoading(false);
      },
      error: () => {
        this.error = 'Failed to load audit logs.';
        this.setLoading(false);
      },
    });
  }

  // KPI counts
  get kpiTotal(): number {
    return this.total || 0;
  }
  get kpiHidden(): number {
    if (this.tab === 'academies') return (this.academies || []).filter((x) => !!x.isHidden).length;
    if (this.tab === 'courses') return (this.courses || []).filter((x) => !!x.isHidden).length;
    return 0;
  }
  get kpiPublished(): number {
    if (this.tab === 'academies') return (this.academies || []).filter((x) => !x.isHidden && !!x.isPublished).length;
    if (this.tab === 'courses') return (this.courses || []).filter((x) => !x.isHidden && x.status === 1).length;
    return 0;
  }
  get kpiDraft(): number {
    if (this.tab === 'academies') return (this.academies || []).filter((x) => !x.isHidden && !x.isPublished).length;
    if (this.tab === 'courses') return (this.courses || []).filter((x) => !x.isHidden && x.status === 0).length;
    return 0;
  }
  get kpiPrivate(): number {
    if (this.tab === 'courses') return (this.courses || []).filter((x) => !x.isHidden && x.status === 2).length;
    return 0;
  }
  get kpiLocked(): number {
    if (this.tab === 'users') return (this.users || []).filter((x) => this.isUserLocked(x)).length;
    return 0;
  }

  // ---------------- Moderation Drawer ----------------
  openHideDrawer(kind: HideTargetKind, id: string, title: string, existingReason?: string | null) {
    if (this.isBusy(id)) return;

    this.hideOpen = true;
    this.hideKind = kind;
    this.hideId = id;
    this.hideTitle = title;

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

  async confirmHide() {
    const id = this.hideId;
    if (!id) return;

    const reason = (this.reasonCtrl.value || '').trim();
    const safeReason = reason.length ? reason : 'Policy violation';

    const ok = await this.confirm.open({
      title: `Hide ${this.hideKind}?`,
      message: `This will remove it from public pages immediately.\n\nReason: ${safeReason}`,
      confirmText: 'Yes, hide',
      cancelText: 'Cancel',
    });

    if (!ok) return;

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
        },
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
      },
    });
  }

  // ---------------- Unhide ----------------
  async unhideAcademy(a: AcademyItem) {
    if (this.isBusy(a.id)) return;

    const ok = await this.confirm.open({
      title: 'Unhide academy?',
      message: `This will make "${(a.name || 'Academy').trim()}" visible again (depending on publish state).`,
      confirmText: 'Yes, unhide',
      cancelText: 'Cancel',
    });

    if (!ok) return;

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
      },
    });
  }

  async unhideCourse(c: CourseItem) {
    if (this.isBusy(c.id)) return;

    const ok = await this.confirm.open({
      title: 'Unhide course?',
      message: `This will make "${(c.title || 'Course').trim()}" visible again (depending on status).`,
      confirmText: 'Yes, unhide',
      cancelText: 'Cancel',
    });

    if (!ok) return;

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
      },
    });
  }

  // ---------------- Delete Drawer ----------------
  openDeleteDrawer(kind: DeleteTargetKind, id: string, title: string) {
    if (!id || this.isBusy(id)) return;

    this.deleteOpen = true;
    this.deleteKind = kind;
    this.deleteId = id;
    this.deleteTitle = title;

    this.deleteReasonCtrl.setValue('Policy violation');
  }

  closeDeleteDrawer() {
    this.deleteOpen = false;
    this.deleteKind = 'academy';
    this.deleteId = null;
    this.deleteTitle = null;
    this.deleteReasonCtrl.setValue('Policy violation');
  }

  pickDeleteReason(r: string) {
    this.deleteReasonCtrl.setValue(r);
  }

  async confirmDelete() {
    const id = this.deleteId;
    if (!id) return;

    const reason = (this.deleteReasonCtrl.value || '').trim();
    const safeReason = reason.length ? reason : 'Policy violation';

    const ok = await this.confirm.open({
      title: `Delete ${this.deleteKind}?`,
      message: `This is permanent and cannot be undone.\n\nTarget: ${(this.deleteTitle || '').trim()}\nReason: ${safeReason}`,
      confirmText: 'Yes, delete',
      cancelText: 'Cancel',
    });

    if (!ok) return;

    this.busy.add(id);

    if (this.deleteKind === 'academy') {
      this.api.deleteAcademy(id, safeReason).subscribe({
        next: () => {
          this.busy.delete(id);
          this.toast.success('Academy deleted.');
          this.closeDeleteDrawer();
          this.load();
        },
        error: () => {
          this.busy.delete(id);
          this.toast.error('Delete failed.');
        },
      });
      return;
    }

    this.api.deleteCourse(id, safeReason).subscribe({
      next: () => {
        this.busy.delete(id);
        this.toast.success('Course deleted.');
        this.closeDeleteDrawer();
        this.load();
      },
      error: () => {
        this.busy.delete(id);
        this.toast.error('Delete failed.');
      },
    });
  }

  // ---------------- Users (Lock with duration) ----------------
  isUserLocked(u: UserItem): boolean {
    if (!u?.lockoutEnd) return false;
    const t = Date.parse(u.lockoutEnd);
    if (!Number.isFinite(t)) return true;
    return t > Date.now();
  }

  openLockDrawer(u: UserItem) {
    if (!u?.id || this.isBusy(u.id)) return;
    this.lockOpen = true;
    this.lockUser = u;
    this.lockSaving = false;
    this.lockPreset = '7d';
  }

  closeLockDrawer() {
    this.lockOpen = false;
    this.lockUser = null;
    this.lockSaving = false;
    this.lockPreset = '7d';
  }

  pickLockPreset(p: '1d' | '7d' | '30d' | 'perm') {
    this.lockPreset = p;
  }

  private presetToPayload(p: '1d' | '7d' | '30d' | 'perm') {
    if (p === 'perm') return { locked: true, permanent: true as const };
    if (p === '1d') return { locked: true, days: 1 };
    if (p === '7d') return { locked: true, days: 7 };
    return { locked: true, days: 30 };
  }

  async confirmLock() {
    const u = this.lockUser;
    if (!u?.id || this.isBusy(u.id) || this.lockSaving) return;

    const label =
      this.lockPreset === 'perm' ? 'Permanent' :
      this.lockPreset === '1d' ? '1 day' :
      this.lockPreset === '7d' ? '7 days' : '30 days';

    const ok = await this.confirm.open({
      title: 'Lock user?',
      message: `Lock "${u.email}"?\n\nDuration: ${label}`,
      confirmText: 'Yes, lock',
      cancelText: 'Cancel',
    });

    if (!ok) return;

    const payload = this.presetToPayload(this.lockPreset);

    this.lockSaving = true;
    this.busy.add(u.id);

    this.api.setUserLock(u.id, payload).subscribe({
      next: () => {
        this.busy.delete(u.id);
        this.lockSaving = false;
        this.toast.success('User locked.');
        this.closeLockDrawer();
        this.load();
      },
      error: () => {
        this.busy.delete(u.id);
        this.lockSaving = false;
        this.toast.error('Update failed.');
      },
    });
  }

  async unlockUser(u: UserItem) {
    if (!u?.id || this.isBusy(u.id)) return;

    const ok = await this.confirm.open({
      title: 'Unlock user?',
      message: `Unlock "${u.email}" immediately?`,
      confirmText: 'Yes, unlock',
      cancelText: 'Cancel',
    });

    if (!ok) return;

    this.busy.add(u.id);

    this.api.setUserLock(u.id, { locked: false }).subscribe({
      next: () => {
        this.busy.delete(u.id);
        this.toast.success('User unlocked.');
        this.load();
      },
      error: () => {
        this.busy.delete(u.id);
        this.toast.error('Update failed.');
      },
    });
  }

  // ---------------- Roles Drawer ----------------
  openRolesDrawer(u: UserItem) {
    if (!u?.id || this.isBusy(u.id)) return;

    this.rolesOpen = true;
    this.rolesUser = u;
    this.rolesSaving = false;

    this.rolesSelected.clear();
    (u.roles || []).forEach((r) => this.rolesSelected.add(r));
  }

  closeRolesDrawer() {
    this.rolesOpen = false;
    this.rolesUser = null;
    this.rolesSaving = false;
    this.rolesSelected.clear();
  }

  roleSelected(r: string) {
    return this.rolesSelected.has(r);
  }

  toggleRole(r: string, checked: boolean) {
    if (checked) this.rolesSelected.add(r);
    else this.rolesSelected.delete(r);
  }

  roleHint(r: string): string {
    if (r === 'Student') return 'Can enroll and learn.';
    if (r === 'Instructor') return 'Can create academies & courses.';
    if (r === 'Coordinator') return 'Can manage coordination tasks.';
    return 'Full moderation access.';
  }

  async saveRoles() {
    const u = this.rolesUser;
    if (!u?.id || this.isBusy(u.id) || this.rolesSaving) return;

    const roles = Array.from(this.rolesSelected.values());

    const ok = await this.confirm.open({
      title: 'Save roles?',
      message: `Apply roles to "${u.email}"?\n\nRoles: ${roles.length ? roles.join(', ') : 'None'}`,
      confirmText: 'Yes, save',
      cancelText: 'Cancel',
    });

    if (!ok) return;

    this.rolesSaving = true;
    this.busy.add(u.id);

    this.api.setUserRoles(u.id, roles).subscribe({
      next: () => {
        this.busy.delete(u.id);
        this.rolesSaving = false;
        this.toast.success('Roles updated.');
        this.closeRolesDrawer();
        this.load();
      },
      error: () => {
        this.busy.delete(u.id);
        this.rolesSaving = false;
        this.toast.error('Update failed.');
      },
    });
  }

  // ---------------- UI helpers ----------------
  trackById = (_: number, x: any) => x?.id;
  trackByAuditId = (_: number, x: any) => x?.id;

  formatDate(v?: string | null): string | null {
    if (!v) return null;
    const t = Date.parse(v);
    if (!Number.isFinite(t)) return null;
    return new Date(t).toLocaleString();
  }

  courseStatusLabel(s: number): string {
    if (s === 1) return 'Published';
    if (s === 2) return 'Private';
    return 'Draft';
  }

  copy(text: string) {
    if (!text) return;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
      this.toast.success('Copied');
      return;
    }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      this.toast.success('Copied');
    } catch {
      // ignore
    }
  }
}
