import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map, shareReplay, startWith, switchMap } from 'rxjs/operators';

import { OrgApi } from '../../../core/services/org-api';

type LoadState<T> = { loading: boolean; data: T | null; error: string | null };

type AcademyVm = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  logoUrl?: string | null;
  primaryColor?: string | null;
  isPublished: boolean;
  isHidden: boolean;
  hiddenReason?: string | null;
  hiddenAt?: string | null;
  courseCount: number;
  instructorCount: number;
  createdAt: string;
  instructorRegisterPath?: string | null;
};

type ManageVm = {
  academies: AcademyVm[];
  total: number;
  published: number;
  drafts: number;
  hidden: number;
};

@Component({
  selector: 'app-org-academies',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './org-academies.html',
  styleUrl: './org-academies.scss',
})
export class OrgAcademiesComponent {
  private reload$ = new BehaviorSubject<void>(undefined);
  state$: Observable<LoadState<ManageVm>>;

  publishingIds = new Set<string>();
  deletingIds   = new Set<string>();

  copiedId: string | null = null;

  constructor(private orgApi: OrgApi, private router: Router) {
    this.state$ = this.reload$.pipe(
      switchMap(() =>
        this.orgApi.listAcademies().pipe(
          map((items: any[]) => {
            const academies: AcademyVm[] = (items ?? []).map((a: any) => ({
              id:             a.id,
              name:           a.name ?? '',
              slug:           a.slug ?? '',
              description:    a.description ?? null,
              logoUrl:        a.logoUrl ?? null,
              primaryColor:   a.primaryColor ?? null,
              isPublished:    !!(a.isPublished ?? a.IsPublished),
              isHidden:       !!(a.isHidden ?? a.IsHidden),
              hiddenReason:   a.hiddenReason ?? null,
              hiddenAt:       a.hiddenAt ?? null,
              courseCount:    Number(a.courseCount ?? 0),
              instructorCount: Number(a.instructorCount ?? 0),
              createdAt:      a.createdAt ?? '',
              instructorRegisterPath: a.instructorRegisterPath ?? null,
            }));

            const total     = academies.length;
            const published = academies.filter(a => a.isPublished && !a.isHidden).length;
            const hidden    = academies.filter(a => a.isHidden).length;
            const drafts    = academies.filter(a => !a.isPublished && !a.isHidden).length;

            return { loading: false, data: { academies, total, published, drafts, hidden }, error: null } as LoadState<ManageVm>;
          }),
          startWith({ loading: true, data: null, error: null } as LoadState<ManageVm>),
          catchError((err) =>
            of({
              loading: false, data: null,
              error: `Failed to load academies: ${err?.status ?? ''} ${err?.statusText ?? ''}`.trim(),
            } as LoadState<ManageVm>)
          )
        )
      ),
      shareReplay(1)
    );
  }

  reload() { this.reload$.next(); }

  badgeLetter(name: string) { return (name || 'A')[0].toUpperCase(); }

  subtitle(a: AcademyVm): string {
    return (a.description || a.slug || '').trim() || '—';
  }

  instructorLink(a: AcademyVm): string {
    return `${window.location.origin}/#/register-instructor?academy=${a.slug}`;
  }

  copyLink(ev: Event, a: AcademyVm) {
    ev.preventDefault(); ev.stopPropagation();
    const link = this.instructorLink(a);
    navigator.clipboard.writeText(link).then(() => {
      this.copiedId = a.id;
      setTimeout(() => { if (this.copiedId === a.id) this.copiedId = null; }, 2000);
    });
  }

  isCopied(id: string) { return this.copiedId === id; }

  canTogglePublish(a: AcademyVm): boolean {
    return !a.isHidden && !this.publishingIds.has(a.id);
  }

  isPublishing(id: string) { return this.publishingIds.has(id); }
  isDeleting(id: string)   { return this.deletingIds.has(id); }

  togglePublish(ev: Event, a: AcademyVm) {
    ev.preventDefault(); ev.stopPropagation();
    if (!this.canTogglePublish(a)) return;
    const next = !a.isPublished;
    this.publishingIds.add(a.id);
    this.orgApi.setAcademyPublish(a.id, next).subscribe({
      next: () => { this.publishingIds.delete(a.id); this.reload(); },
      error: (err) => {
        this.publishingIds.delete(a.id);
        window.alert(`Failed: ${err?.error ?? err?.statusText ?? 'Unknown error'}`);
      },
    });
  }

  deleteAcademy(ev: Event, a: AcademyVm) {
    ev.preventDefault(); ev.stopPropagation();
    if (this.deletingIds.has(a.id)) return;
    const ok = window.confirm(`Delete "${a.name}"?\n\nThis will permanently delete the academy and all its content. This cannot be undone.`);
    if (!ok) return;
    this.deletingIds.add(a.id);
    this.orgApi.deleteAcademy(a.id).subscribe({
      next: () => { this.deletingIds.delete(a.id); this.reload(); },
      error: (err) => {
        this.deletingIds.delete(a.id);
        window.alert(`Delete failed: ${err?.error ?? err?.statusText ?? 'Unknown error'}`);
      },
    });
  }

  openAcademy(a: AcademyVm) {
    this.router.navigate(['/instructor/courses', a.id]);
  }

  hiddenMessage(a: AcademyVm): string {
    const reason = (a.hiddenReason || '').trim();
    if (a.hiddenAt) {
      const d = new Date(a.hiddenAt).toLocaleString();
      return reason ? `Hidden by admin on ${d}. Reason: ${reason}` : `Hidden by admin on ${d}.`;
    }
    return reason ? `Hidden by admin. Reason: ${reason}` : 'Hidden by admin.';
  }
}