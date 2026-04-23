import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map, shareReplay, startWith, switchMap } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { ToastService } from '../../../shared/ui/toast.service';
import { AdminApi } from '../../../core/services/admin-api';

type LoadState<T> = { loading: boolean; data: T; error: string | null };
type SortKey = 'module' | 'title' | 'type';

type AiSummary = {
  lessonId: string;
  summary: string;
  keyPoints: string[];
  importantTerms: string[];
  createdAt: string;
};

type LessonItem = {
  id: string;
  title: string;
  type: number;
  contentUrl?: string | null;
  htmlContent?: string | null;
  quizId?: string | null;
  sortOrder: number;
  isPreviewFree: boolean;
  isDownloadable: boolean;
  moduleId: string;
  moduleTitle: string;
  moduleSortOrder: number;
  aiSummary: AiSummary | null;
  aiLoading: boolean;
  aiGenerating: boolean;
  aiError: string | null;
};

type PageVm = {
  course: {
    id: string;
    title: string;
    shortDescription?: string | null;
    fullDescription?: string | null;
    category?: string | null;
    thumbnailUrl?: string | null;
    status?: number;
    isHidden?: boolean;
    hiddenReason?: string | null;
  };
  lessons: LessonItem[];
};

@Component({
  selector: 'app-admin-course-lessons',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './admin-course-lessons.html',
  styleUrl: './admin-course-lessons.scss',
})
export class AdminCourseLessonsComponent {
  api = environment.apiBaseUrl;
  courseId = '';
  query = '';
  sort: SortKey = 'module';
  hideNoContent = false;

  private reload$ = new BehaviorSubject<void>(undefined);
  state$: Observable<LoadState<PageVm>>;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private adminApi: AdminApi,
    private toast: ToastService
  ) {
    this.courseId = this.route.snapshot.paramMap.get('courseId') || '';

    this.state$ = this.reload$.pipe(
      switchMap(() =>
        this.adminApi.getCourseLessons(this.courseId).pipe(
          map((res) => {
            const lessons: LessonItem[] = (res.modules ?? []).flatMap((m: any) =>
              (m.lessons ?? []).map((l: any) => ({
                id: l.id,
                title: l.title,
                type: l.type,
                contentUrl: l.contentUrl ?? null,
                htmlContent: l.htmlContent ?? null,
                quizId: l.quizId ?? null,
                sortOrder: l.sortOrder,
                isPreviewFree: l.isPreviewFree,
                isDownloadable: l.isDownloadable,
                moduleId: m.id,
                moduleTitle: m.title,
                moduleSortOrder: m.sortOrder,
                aiSummary: null,
                aiLoading: false,
                aiGenerating: false,
                aiError: null
              }))
            );

            return {
              loading: false,
              data: {
                course: {
                  id: res.id,
                  title: res.title,
                  shortDescription: res.shortDescription,
                  fullDescription: res.fullDescription,
                  category: res.category,
                  thumbnailUrl: res.thumbnailUrl,
                  status: res.status,
                  isHidden: res.isHidden,
                  hiddenReason: res.hiddenReason,
                },
                lessons
              },
              error: null
            } as LoadState<PageVm>;
          }),
          startWith({
            loading: true,
            data: {
              course: { id: '', title: '' },
              lessons: []
            },
            error: null
          } as LoadState<PageVm>),
          catchError((err) =>
            of({
              loading: false,
              data: {
                course: { id: '', title: '' },
                lessons: []
              },
              error: `Failed to load lessons: ${err?.status ?? ''} ${err?.statusText ?? ''}`.trim()
            } as LoadState<PageVm>)
          )
        )
      ),
      shareReplay(1)
    );
  }

  reload() {
    this.reload$.next();
  }

  back() {
    this.router.navigateByUrl('/admin');
  }

  img(url?: string | null) {
    if (!url) return null;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return `${this.api}${url}`;
  }

  isQuiz(item: LessonItem) {
    return item.type === 3;
  }

  hasContent(item: LessonItem) {
    if (this.isQuiz(item)) {
      return !!item.quizId;
    }

    return !!item.contentUrl || !!item.htmlContent;
  }

  visible(items: LessonItem[]) {
    const q = (this.query || '').trim().toLowerCase();

    return (items || []).filter((x) => {
      if (this.hideNoContent && !this.hasContent(x)) return false;
      if (!q) return true;

      const title = (x.title || '').toLowerCase();
      const module = (x.moduleTitle || '').toLowerCase();

      return title.includes(q) || module.includes(q);
    });
  }

  sorted(items: LessonItem[]) {
    const arr = [...(items || [])];

    switch (this.sort) {
      case 'title':
        return arr.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      case 'type':
        return arr.sort((a, b) => this.typeLabel(a.type).localeCompare(this.typeLabel(b.type)));
      default:
        return arr.sort((a, b) => {
          if (a.moduleSortOrder !== b.moduleSortOrder) {
            return a.moduleSortOrder - b.moduleSortOrder;
          }
          return a.sortOrder - b.sortOrder;
        });
    }
  }

  typeLabel(type: number) {
    switch (type) {
      case 0: return 'Video';
      case 1: return 'Document';
      case 2: return 'Text';
      case 3: return 'Quiz';
      default: return 'Unknown';
    }
  }

  loadSummary(item: LessonItem, ev?: Event) {
    ev?.stopPropagation();

    item.aiLoading = true;
    item.aiError = null;

    fetch(`${this.api}/api/ai/lessons/${item.id}/summary`, {
      headers: this.authHeaders()
    })
      .then(async (r) => {
        if (r.status === 404) {
          item.aiSummary = null;
          item.aiLoading = false;
          return null;
        }

        if (!r.ok) {
          throw await r.text();
        }

        return r.json();
      })
      .then((res) => {
        if (res) {
          item.aiSummary = res;
        }
        item.aiLoading = false;
      })
      .catch((err) => {
        item.aiLoading = false;
        item.aiError = typeof err === 'string' ? err : 'Failed to load summary.';
      });
  }

  generateSummary(item: LessonItem, ev?: Event) {
    ev?.stopPropagation();

    if (!this.hasContent(item)) {
      item.aiError = 'This lesson has no content to summarize yet.';
      this.toast.error('This lesson has no content to summarize yet.');
      return;
    }

    item.aiGenerating = true;
    item.aiError = null;

    fetch(`${this.api}/api/ai/lessons/${item.id}/summary/generate`, {
      method: 'POST',
      headers: this.authHeaders()
    })
      .then(async (r) => {
        if (!r.ok) {
          throw await r.text();
        }

        return r.json();
      })
      .then((res) => {
        item.aiSummary = res;
        item.aiGenerating = false;
        this.toast.success('AI summary generated.');
      })
      .catch((err) => {
        item.aiGenerating = false;
        item.aiError = typeof err === 'string' ? err : 'Failed to generate AI summary.';
        this.toast.error('Failed to generate AI summary.');
      });
  }

  authHeaders(): HeadersInit {
    const token =
      localStorage.getItem('lp_token') ||
      localStorage.getItem('token') ||
      localStorage.getItem('jwt') ||
      '';

    const headers: Record<string, string> = {};

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    return headers;
  }

  moduleCount(items: LessonItem[]) {
    return new Set((items || []).map(x => x.moduleId)).size;
  }

  withSummaryCount(items: LessonItem[]) {
    return (items || []).filter(x => !!x.aiSummary).length;
  }

  noContentCount(items: LessonItem[]) {
    return (items || []).filter(x => !this.hasContent(x)).length;
  }
}