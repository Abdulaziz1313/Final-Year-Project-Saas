import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map, shareReplay, startWith, switchMap } from 'rxjs/operators';

import { OrgApi } from '../../../core/services/org-api';
import { environment } from '../../../../environments/environment';
import { TranslatePipe } from '../../../shared/pipes/translate-pipe';
import { LanguageService } from '../../../core/services/language-services';
import { ConfirmModalComponent } from '../../../shared/ui/confirm-modal/confirm-modal';
import { ConfirmService } from '../../../shared/ui/confirm.service';
import { ToastService } from '../../../shared/ui/toast.service';

type LoadState<T> = { loading: boolean; data: T | null; error: string | null };

type AcademyVm = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  logoUrl?: string | null;
  bannerUrl?: string | null;
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
  imports: [CommonModule, RouterModule, TranslatePipe],
  templateUrl: './org-academies.html',
  styleUrl: './org-academies.scss',
})
export class OrgAcademiesComponent {
  api = environment.apiBaseUrl;

  private reload$ = new BehaviorSubject<void>(undefined);
  state$: Observable<LoadState<ManageVm>>;

  publishingIds = new Set<string>();
  deletingIds = new Set<string>();
  copiedId: string | null = null;

  constructor(
    private orgApi: OrgApi,
    private router: Router,
    public lang: LanguageService,
    private confirm: ConfirmService,
    private toast: ToastService
  ) {
    this.state$ = this.reload$.pipe(
      switchMap(() =>
        this.orgApi.listAcademies().pipe(
          map((items: any[]) => {
            const academies: AcademyVm[] = (items ?? []).map((a: any) => ({
              id: a.id,
              name: a.name ?? '',
              slug: a.slug ?? '',
              description: a.description ?? null,
              logoUrl: a.logoUrl ?? null,
              bannerUrl: a.bannerUrl ?? null,
              primaryColor: a.primaryColor ?? null,
              isPublished: !!(a.isPublished ?? a.IsPublished),
              isHidden: !!(a.isHidden ?? a.IsHidden),
              hiddenReason: a.hiddenReason ?? null,
              hiddenAt: a.hiddenAt ?? null,
              courseCount: Number(a.courseCount ?? 0),
              instructorCount: Number(a.instructorCount ?? 0),
              createdAt: a.createdAt ?? '',
              instructorRegisterPath: a.instructorRegisterPath ?? null,
            }));

            const total = academies.length;
            const published = academies.filter((x) => x.isPublished && !x.isHidden).length;
            const hidden = academies.filter((x) => x.isHidden).length;
            const drafts = academies.filter((x) => !x.isPublished && !x.isHidden).length;

            return {
              loading: false,
              data: { academies, total, published, drafts, hidden },
              error: null,
            } as LoadState<ManageVm>;
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

  img(url?: string | null) {
    if (!url) return null;
    return url.startsWith('http') ? url : `${this.api}${url}`;
  }

  badgeLetter(name: string) {
    return (name || 'A')[0].toUpperCase();
  }

  academyPublicLink(a: AcademyVm): string {
    return `${window.location.origin}/#/academy-home/${encodeURIComponent(a.slug)}`;
  }

  copyLink(ev: Event, a: AcademyVm) {
    ev.preventDefault();
    ev.stopPropagation();

    const link = this.academyPublicLink(a);

    navigator.clipboard.writeText(link).then(() => {
      this.copiedId = a.id;
      this.toast.success('Link copied');
      setTimeout(() => {
        if (this.copiedId === a.id) this.copiedId = null;
      }, 2000);
    }).catch(() => {
      this.toast.error('Failed to copy link');
    });
  }

  isCopied(id: string) {
    return this.copiedId === id;
  }

  canTogglePublish(a: AcademyVm): boolean {
    return !a.isHidden && !this.publishingIds.has(a.id);
  }

  isPublishing(id: string) {
    return this.publishingIds.has(id);
  }

  isDeleting(id: string) {
    return this.deletingIds.has(id);
  }

  togglePublish(ev: Event, a: AcademyVm) {
    ev.preventDefault();
    ev.stopPropagation();

    if (!this.canTogglePublish(a)) return;

    const next = !a.isPublished;
    this.publishingIds.add(a.id);

    this.orgApi.setAcademyPublish(a.id, next).subscribe({
      next: () => {
        this.publishingIds.delete(a.id);
        this.toast.success(next ? 'Academy published' : 'Academy moved to draft');
        this.reload();
      },
      error: (err) => {
        this.publishingIds.delete(a.id);
        this.toast.error(`Failed: ${err?.error ?? err?.statusText ?? 'Unknown error'}`);
      },
    });
  }

  async deleteAcademy(ev: Event, a: AcademyVm) {
    ev.preventDefault();
    ev.stopPropagation();

    if (this.deletingIds.has(a.id)) return;

    const ok = await this.confirm.open({
      title: `Delete "${a.name}"?`,
      message: 'This will permanently delete the academy and all its content. This cannot be undone.',
      confirmText: 'Delete academy',
      cancelText: 'Cancel',
    });

    if (!ok) return;

    this.deletingIds.add(a.id);

    this.orgApi.deleteAcademy(a.id).subscribe({
      next: () => {
        this.deletingIds.delete(a.id);
        this.toast.success('Academy deleted');
        this.reload();
      },
      error: (err) => {
        this.deletingIds.delete(a.id);
        this.toast.error(`Delete failed: ${err?.error ?? err?.statusText ?? 'Unknown error'}`);
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