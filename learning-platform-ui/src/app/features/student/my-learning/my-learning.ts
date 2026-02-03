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

  reload() { this.reload$.next(); }

  img(url?: string | null) {
    if (!url) return null;
    return `${this.api}${url}`;
  }

  // ✅ Prevent opening hidden courses
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

  sorted(items: MyLearningItem[]) {
    const arr = items.slice();
    switch (this.sort) {
      case 'title':
        return arr.sort((a, b) => (a.course.title || '').localeCompare(b.course.title || ''));
      case 'progress':
        return arr.sort((a, b) => (b.progress.percent ?? 0) - (a.progress.percent ?? 0));
      default:
        return arr.sort((a, b) => {
          const ad = new Date(a.enrollment.enrolledAt).getTime() || 0;
          const bd = new Date(b.enrollment.enrolledAt).getTime() || 0;
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
}
