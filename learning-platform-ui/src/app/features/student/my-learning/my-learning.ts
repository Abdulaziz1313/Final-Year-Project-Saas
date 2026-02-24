import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map, shareReplay, startWith, switchMap } from 'rxjs/operators';
import { StudentApi, MyLearningItem } from '../../../core/services/student-api';
import { environment } from '../../../../environments/environment';
import { ToastService } from '../../../shared/ui/toast.service';

type LoadState<T> = { loading: boolean; data: T; error: string | null };
type SortKey = 'recent' | 'progress' | 'title';

@Component({
  selector: 'app-my-learning',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './my-learning.html',
  styleUrl: './my-learning.scss',
})
export class MyLearningComponent {
  api = environment.apiBaseUrl;

  sort: SortKey = 'recent';
  query = '';
  hideUnavailable = false;

  downloading = new Set<string>();

  private reload$ = new BehaviorSubject<void>(undefined);
  state$: Observable<LoadState<MyLearningItem[]>>;

  constructor(private student: StudentApi, private router: Router, private toast: ToastService) {
    this.state$ = this.reload$.pipe(
      switchMap(() =>
        this.student.myLearning().pipe(
          map((res) => ({ loading: false, data: res ?? [], error: null } as LoadState<MyLearningItem[]>)),
          startWith({ loading: true, data: [], error: null } as LoadState<MyLearningItem[]>),
          catchError((err) =>
            of({
              loading: false,
              data: [],
              error: `Failed to load My Learning: ${err?.status ?? ''} ${err?.statusText ?? ''}`.trim(),
            } as LoadState<MyLearningItem[]>)
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
    return `${this.api}${url}`;
  }

  continue(item: MyLearningItem) {
    if (item.course.isHidden) {
      const reason = item.course.hiddenReason || 'Policy violation';
      this.toast.error(`This course is unavailable. Hidden by admin. Reason: ${reason}`);
      return;
    }
    this.router.navigateByUrl(`/learn/${item.course.id}`);
  }

  ctaLabel(x: MyLearningItem) {
    if (x.course.isHidden) return 'Unavailable';
    return x.enrollment.lastLessonId ? 'Continue' : 'Start';
  }

  downloadCert(x: MyLearningItem, ev: Event) {
    ev.preventDefault();
    ev.stopPropagation();

    if (x.course.isHidden) return;

    const percent = x.progress?.percent ?? 0;
    if (percent < 100) {
      this.toast.info('Finish the course to unlock the certificate.');
      return;
    }

    const courseId = x.course.id;

    if (this.downloading.has(courseId)) return;
    this.downloading.add(courseId);

    this.student.issueCertificate(courseId).subscribe({
      next: (res) => {
        this.student.downloadCertificatePdf(res.id).subscribe({
          next: (blob) => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `certificate-${res.certificateNumber}.pdf`;
            a.click();
            window.URL.revokeObjectURL(url);

            this.toast.success('Certificate downloaded.');
            this.downloading.delete(courseId);
          },
          error: () => {
            this.toast.error('Failed to download certificate PDF.');
            this.downloading.delete(courseId);
          },
        });
      },
      error: (err) => {
        const msg = err?.error || 'You must complete the course first.';
        this.toast.error(typeof msg === 'string' ? msg : 'Could not issue certificate.');
        this.downloading.delete(courseId);
      },
    });
  }

  visible(items: MyLearningItem[]) {
    const q = (this.query || '').trim().toLowerCase();

    return (items || []).filter((x) => {
      if (this.hideUnavailable && x.course.isHidden) return false;
      if (!q) return true;

      const title = (x.course.title || '').toLowerCase();
      const desc = (x.course.shortDescription || '').toLowerCase();
      const cat = (x.course.category || '').toLowerCase();

      return title.includes(q) || desc.includes(q) || cat.includes(q);
    });
  }

  sorted(items: MyLearningItem[]) {
    const arr = (items || []).slice();
    switch (this.sort) {
      case 'title':
        return arr.sort((a, b) => (a.course.title || '').localeCompare(b.course.title || ''));
      case 'progress':
        return arr.sort((a, b) => (b.progress.percent ?? 0) - (a.progress.percent ?? 0));
      default:
        return arr.sort((a, b) => {
          const ad = Date.parse(a.enrollment.enrolledAt as any) || 0;
          const bd = Date.parse(b.enrollment.enrolledAt as any) || 0;
          return bd - ad;
        });
    }
  }

  progressText(x: MyLearningItem) {
    return `${x.progress.done}/${x.progress.total}`;
  }

  ringDash(percent: number) {
    const p = Math.max(0, Math.min(100, percent || 0));
    const circ = 2 * Math.PI * 14;
    const filled = (p / 100) * circ;
    return `${filled} ${circ - filled}`;
  }

  hiddenCount(items: MyLearningItem[]) {
    return (items || []).filter((x) => x.course.isHidden).length;
  }

  activeCount(items: MyLearningItem[]) {
    return (items || []).filter((x) => !x.course.isHidden).length;
  }

  avgProgress(items: MyLearningItem[]) {
    const active = (items || []).filter((x) => !x.course.isHidden);
    if (active.length === 0) return 0;
    const sum = active.reduce((acc, x) => acc + (x.progress.percent ?? 0), 0);
    return Math.round(sum / active.length);
  }
}