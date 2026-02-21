import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ToastService } from '../../../../shared/ui/toast.service';
import { StudentApi, QuizSubmitResult } from '../../../../core/services/student-api';
import { Observable, of, throwError } from 'rxjs';
import { catchError, finalize, tap } from 'rxjs/operators';

@Component({
  selector: 'app-quiz-player',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './quiz-player.html',
  styleUrl: './quiz-player.scss',
})
export class QuizPlayerComponent implements OnInit {
  @Input() lessonId!: string;

  loading = false;
  quiz: any = null;

  form: FormGroup;

  submitting = false;
  result: QuizSubmitResult | null = null;
  needsReview = false;

  // review / read-only mode
  reviewMode = false;
  latestAttempt: any = null;

  // ✅ premium retake UI
  retaking = false;
  showRetakeConfirm = false;

  constructor(private fb: FormBuilder, private api: StudentApi, private toast: ToastService) {
    this.form = this.fb.group({
      answers: this.fb.array([]),
    });
  }

  get answers(): FormArray {
    return this.form.get('answers') as FormArray;
  }

  ngOnInit() {
    this.load();
  }

  private setReviewModeLocked(locked: boolean) {
    this.reviewMode = locked;
    if (locked) this.form.disable({ emitEvent: false });
    else this.form.enable({ emitEvent: false });
  }

  load() {
    if (!this.lessonId) return;

    this.loading = true;
    this.showRetakeConfirm = false;

    this.api.getLessonQuiz(this.lessonId).subscribe({
      next: (q) => {
        this.loading = false;
        this.quiz = q;

        // from backend
        this.latestAttempt = q.latestAttempt ?? null;

        this.answers.clear();

        for (const qq of (q.questions ?? [])) {
          this.answers.push(
            this.fb.group({
              questionId: [qq.id, Validators.required],
              selectedChoiceId: [null],
              answerText: [''],
            })
          );
        }

        // Fill from latestAnswers (preferred) or draftAnswers
        const latestAnswers = (q.latestAnswers ?? q.draftAnswers ?? []) as Array<any>;
        if (latestAnswers.length) {
          const map = new Map<string, any>();
          for (const a of latestAnswers) map.set(String(a.questionId), a);

          for (const row of this.answers.controls as FormGroup[]) {
            const qid = String(row.get('questionId')?.value);
            const a = map.get(qid);
            if (!a) continue;

            row.patchValue(
              {
                selectedChoiceId: a.selectedChoiceId ?? null,
                answerText: a.answerText ?? '',
              },
              { emitEvent: false }
            );
          }
        }

        // If submitted => lock and show result
        const submittedAt = this.latestAttempt?.submittedAt ?? null;
        if (submittedAt) {
          this.setReviewModeLocked(true);

          this.result = {
            attemptId: this.latestAttempt.attemptId ?? this.latestAttempt.id,
            score: this.latestAttempt.score ?? 0,
            maxScore: this.latestAttempt.maxScore ?? 0,
            status: this.latestAttempt.status,
          };

          this.needsReview = this.latestAttempt.status === 2;
        } else {
          this.setReviewModeLocked(false);
          this.result = null;
          this.needsReview = false;
        }
      },
      error: (err) => {
        this.loading = false;
        this.toast.error(typeof err?.error === 'string' ? err.error : 'Failed to load quiz.');
      },
    });
  }

  // ---------- UI helpers ----------
  totalCount(): number {
    return (this.quiz?.questions?.length ?? 0) as number;
  }

  answeredCount(): number {
    if (!this.answers?.length) return 0;
    let n = 0;
    for (let i = 0; i < this.answers.length; i++) if (this.isAnswered(i)) n++;
    return n;
  }

  progressPercent(): number {
    const t = this.totalCount() || 1;
    return Math.round((this.answeredCount() / t) * 100);
  }

  isAnswered(i: number): boolean {
    const q = this.qAt(i);
    const row = this.answers.at(i) as FormGroup;
    if (!q || !row) return false;

    const type = Number(q.type);
    if (type === 2) {
      const txt = String(row.get('answerText')?.value ?? '').trim();
      return txt.length > 0;
    }

    const pick = row.get('selectedChoiceId')?.value;
    return !!pick;
  }

  typeLabel(type: any): string {
    const t = Number(type);
    if (t === 0) return 'MCQ';
    if (t === 1) return 'True/False';
    if (t === 2) return 'Short answer';
    return 'Question';
  }

  // ---------- payload ----------
  private buildAnswersPayload() {
    const answers = (this.form.getRawValue().answers ?? []).map((a: any) => ({
      questionId: a.questionId,
      selectedChoiceId: a.selectedChoiceId ? a.selectedChoiceId : null,
      answerText: (a.answerText ?? '').trim(),
    }));

    return { answers };
  }

  /**
   * Draft save (optional)
   * - If already submitted (reviewMode) -> treat as no-op (do NOT fail player completion).
   */
  saveDraft(opts?: { showToastOnSuccess?: boolean }): Observable<any> {
    if (this.loading) return throwError(() => new Error('Quiz is still loading.'));
    if (!this.quiz?.id) return throwError(() => new Error('Quiz not loaded (missing quiz id).'));
    if (this.reviewMode) return of({ skipped: true, reason: 'already_submitted' });

    const payload = this.buildAnswersPayload();

    return this.api.saveQuizDraftAttempt(this.quiz.id, payload).pipe(
      tap({
        next: () => {
          if (opts?.showToastOnSuccess) this.toast.success('Draft saved.');
        },
      })
    );
  }

  /**
   * Final submit used by Player markComplete for quiz lessons.
   * Important behavior:
   * - If already submitted (reviewMode) -> return existing result (no-op) instead of throwing.
   */
  submitForCompletion(opts?: { showToastOnSuccess?: boolean }): Observable<QuizSubmitResult> {
    if (this.loading) return throwError(() => new Error('Quiz is still loading.'));
    if (!this.quiz?.id) return throwError(() => new Error('Quiz not loaded (missing quiz id).'));

    // ✅ already submitted => don't error
    if (this.reviewMode) {
      const res =
        this.result ??
        ({
          attemptId: this.latestAttempt?.attemptId ?? this.latestAttempt?.id ?? '',
          score: this.latestAttempt?.score ?? 0,
          maxScore: this.latestAttempt?.maxScore ?? 0,
          status: this.latestAttempt?.status ?? 1,
        } as QuizSubmitResult);

      return of(res);
    }

    const payload = this.buildAnswersPayload();
    this.submitting = true;

    return this.api.submitQuizAttempt(this.quiz.id, payload).pipe(
      tap({
        next: (res) => {
          this.result = res;

          const anyRes = res as any;
          const status = anyRes?.status ?? anyRes?.Status;
          this.needsReview = status === 2;

          // lock after submit
          this.setReviewModeLocked(true);
          this.showRetakeConfirm = false;

          if (opts?.showToastOnSuccess) {
            this.toast.success(`Quiz submitted. Score: ${res.score}/${res.maxScore}`);
          }
        },
      }),
      catchError((err) => {
        const msg =
          (typeof err?.error === 'string' && err.error) ||
          err?.error?.message ||
          err?.error?.title ||
          err?.message ||
          '';

        const low = String(msg).toLowerCase();
        if (low.includes('already') && low.includes('submit')) {
          const res =
            this.result ??
            ({
              attemptId: this.latestAttempt?.attemptId ?? this.latestAttempt?.id ?? '',
              score: this.latestAttempt?.score ?? 0,
              maxScore: this.latestAttempt?.maxScore ?? 0,
              status: this.latestAttempt?.status ?? 1,
            } as QuizSubmitResult);

          this.setReviewModeLocked(true);
          this.showRetakeConfirm = false;
          return of(res);
        }

        return throwError(() => err);
      }),
      finalize(() => {
        this.submitting = false;
      })
    );
  }

  submit() {
    this.submitForCompletion({ showToastOnSuccess: true }).subscribe({
      next: () => {},
      error: (err) => {
        const msg =
          (typeof err?.error === 'string' && err.error) ||
          err?.error?.message ||
          err?.error?.title ||
          `Submit failed (${err?.status ?? 'no status'})`;
        this.toast.error(msg);
      },
    });
  }

  qAt(i: number) {
    return (this.quiz?.questions ?? [])[i];
  }

  // ---------- Premium retake (no browser confirm) ----------
  openRetakeConfirm() {
    if (!this.reviewMode || this.retaking || this.loading || this.submitting) return;
    this.showRetakeConfirm = true;
  }

  cancelRetake() {
    this.showRetakeConfirm = false;
  }

  confirmRetake() {
    if (this.loading || this.submitting || this.retaking) return;
    if (!this.quiz?.id) return;

    this.retaking = true;

    this.api.retakeQuizAttempt(this.quiz.id)
      .pipe(finalize(() => (this.retaking = false)))
      .subscribe({
        next: () => {
          // unlock + clear local UI state
          this.setReviewModeLocked(false);
          this.result = null;
          this.needsReview = false;
          this.latestAttempt = null;
          this.showRetakeConfirm = false;

          // clear answers in form (keeps questionId)
          for (const row of this.answers.controls as FormGroup[]) {
            row.patchValue({ selectedChoiceId: null, answerText: '' }, { emitEvent: false });
          }

          this.toast.success('New attempt started.');
          this.load(); // reload from backend to ensure latestAttempt is now draft
        },
        error: (err) => {
          const msg = typeof err?.error === 'string' ? err.error : 'Failed to restart quiz.';
          this.toast.error(msg);
        },
      });
  }
}
