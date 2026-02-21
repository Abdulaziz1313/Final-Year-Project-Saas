import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map, shareReplay, startWith, switchMap } from 'rxjs/operators';

import { InstructorApi, AcademyDto } from '../../../core/services/instructor-api';

type LoadState<T> = { loading: boolean; data: T | null; error: string | null };

type AcademyVm = AcademyDto & {
  courseCount: number;

  // moderation fields (from Mine() endpoint)
  isHidden?: boolean;
  hiddenReason?: string | null;
  hiddenAt?: string | null;
};

type ManageVm = {
  academies: AcademyVm[];
  total: number;
  published: number;
  drafts: number;
  hidden: number;
};

@Component({
  selector: 'app-instructor-academies-manage',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './academies-manage.html',
  styleUrl: './academies-manage.scss',
})
export class InstructorAcademiesManageComponent {
  private reload$ = new BehaviorSubject<void>(undefined);
  state$: Observable<LoadState<ManageVm>>;

  // per academy busy flags
  publishingIds = new Set<string>();
  deletingIds = new Set<string>();

  constructor(
    private api: InstructorApi,
    private router: Router
  ) {
    this.state$ = this.reload$.pipe(
      switchMap(() =>
        this.api.getMyAcademies().pipe(
          map((items) => {
            const patched: AcademyVm[] = (items ?? []).map((a: any) => {
              const n =
                this.asNumber(a?.courseCount) ??
                this.asNumber(a?.CourseCount) ??
                this.asNumber(a?.coursesCount) ??
                this.asNumber(a?.courses_count) ??
                this.asNumber(a?.totalCourses) ??
                this.asNumber(a?.coursesTotal) ??
                (Array.isArray(a?.courses) ? a.courses.length : null) ??
                0;

              return {
                ...a,
                courseCount: n,

                isHidden: !!(a?.isHidden ?? a?.IsHidden),
                hiddenReason: (a?.hiddenReason ?? a?.HiddenReason ?? null) as string | null,
                hiddenAt: (a?.hiddenAt ?? a?.HiddenAt ?? null) as string | null,
              };
            });

            const total = patched.length;
            const published = patched.reduce((n, a) => n + ((a.isPublished ?? false) ? 1 : 0), 0);
            const hidden = patched.reduce((n, a) => n + (a.isHidden ? 1 : 0), 0);
            const drafts = total - published;

            const vm: ManageVm = { academies: patched, total, published, drafts, hidden };
            return { loading: false, data: vm, error: null } as LoadState<ManageVm>;
          }),
          startWith({ loading: true, data: null, error: null } as LoadState<ManageVm>),
          catchError((err) =>
            of({
              loading: false,
              data: null,
              error: `Failed to load academies: ${err?.status ?? ''} ${err?.statusText ?? ''}`.trim(),
            } as LoadState<ManageVm>)
          )
        )
      ),
      shareReplay(1)
    );
  }

  reload() {
    this.reload$.next();
  }

  // ------- UI helpers -------
  badgeLetter(name?: string | null): string {
    const s = (name || 'A').trim();
    return (s[0] || 'A').toUpperCase();
  }

  subtitle(a: AcademyVm): string {
    return (a.description || a.slug || '').trim() || '—';
  }

  canTogglePublish(a: AcademyVm): boolean {
    if (!a?.id) return false;
    if (a.isHidden) return false;
    if (this.publishingIds.has(a.id)) return false;
    return true;
  }

  isPublishing(id: string): boolean {
    return this.publishingIds.has(id);
  }

  isDeleting(id: string): boolean {
    return this.deletingIds.has(id);
  }

  editLink(a: AcademyVm): any[] {
    // ✅ Change to match your edit route if needed
    return ['/instructor/academy', a.id];
  }

  openCourses(a: AcademyVm) {
    this.router.navigate(['/instructor/courses', a.id]);
  }

  // ✅ Use this instead of alert() in the template
  requestReview(ev: Event, a: AcademyVm) {
    ev.preventDefault();
    ev.stopPropagation();

    // Placeholder until you add backend endpoint
    window.alert(
      `Request review for "${(a.name || 'Academy').trim()}".\n\nConnect this button to a backend endpoint later.`
    );
  }

  // ------- actions -------
  togglePublish(ev: Event, a: AcademyVm) {
    ev.preventDefault();
    ev.stopPropagation();

    if (!a?.id) return;

    if (a.isHidden) {
      window.alert(this.hiddenMessage(a));
      return;
    }

    if (this.publishingIds.has(a.id)) return;

    const next = !(a.isPublished ?? false);
    this.publishingIds.add(a.id);

    this.api.setAcademyPublish(a.id, next).subscribe({
      next: () => {
        this.publishingIds.delete(a.id);
        this.reload();
      },
      error: (err) => {
        this.publishingIds.delete(a.id);
        window.alert(`Update failed: ${err?.status ?? ''} ${err?.statusText ?? ''}`.trim());
      },
    });
  }

  deleteAcademy(ev: Event, a: AcademyVm) {
    ev.preventDefault();
    ev.stopPropagation();

    if (!a?.id) return;
    if (this.deletingIds.has(a.id)) return;

    const name = (a.name || 'this academy').trim();
    const ok = window.confirm(
      `Delete "${name}"?\n\nThis will permanently delete the academy and its content. This cannot be undone.`
    );
    if (!ok) return;

    this.deletingIds.add(a.id);

    this.api.deleteAcademy(a.id).subscribe({
      next: () => {
        this.deletingIds.delete(a.id);
        this.reload();
      },
      error: (err) => {
        this.deletingIds.delete(a.id);
        window.alert(`Delete failed: ${err?.status ?? ''} ${err?.statusText ?? ''}`.trim());
      },
    });
  }

  // moderation message
  formatHiddenAt(v?: string | null): string | null {
    if (!v) return null;
    const t = Date.parse(v);
    if (!Number.isFinite(t)) return null;
    return new Date(t).toLocaleString();
  }

  hiddenMessage(a: AcademyVm): string {
    const reason = (a.hiddenReason || '').trim();
    const when = this.formatHiddenAt(a.hiddenAt);
    if (reason && when) return `Hidden by admin on ${when}.\nReason: ${reason}`;
    if (reason) return `Hidden by admin.\nReason: ${reason}`;
    if (when) return `Hidden by admin on ${when}.`;
    return `Hidden by admin.`;
  }

  private asNumber(v: any): number | null {
    if (v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
}
