import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import {
  ReactiveFormsModule,
  Validators,
  UntypedFormArray,
  UntypedFormBuilder,
  UntypedFormGroup,
} from '@angular/forms';
import { InstructorApi } from '../../../core/services/instructor-api';
import { ToastService } from '../../../shared/ui/toast.service';

type QuizDto = {
  id: string;
  title: string;
  questions: Array<{
    id: string;
    type: number; // 0 mcq, 1 tf, 2 short
    prompt: string;
    points: number;
    choices?: Array<{ id: string; text: string; isCorrect: boolean }>;
    correctAnswerText?: string | null;
    matchType?: number | null;
  }>;
};

@Component({
  selector: 'app-quiz-editor',
  standalone: true,
  imports: [CommonModule, RouterModule, ReactiveFormsModule],
  templateUrl: './quiz-editor.html',
  styleUrl: './quiz-editor.scss',
})
export class QuizEditorComponent {
  lessonId = '';
  loading = false;
  saving = false;

  quiz: QuizDto | null = null;

  form: UntypedFormGroup;

  constructor(
    private route: ActivatedRoute,
    private fb: UntypedFormBuilder,
    private api: InstructorApi,
    private toast: ToastService
  ) {
    this.lessonId = this.route.snapshot.paramMap.get('lessonId') || '';

    this.form = this.fb.group({
      title: ['Quiz', [Validators.required, Validators.minLength(2)]],
      questions: this.fb.array([]),
    });
  }

  ngOnInit() {
    this.load();
  }

  // ---------- Template-safe getters (no ?. needed) ----------
  get questions(): UntypedFormArray {
    return this.form.get('questions') as UntypedFormArray;
  }

  get questionCount(): number {
    return this.questions.length;
  }

  get hasQuestions(): boolean {
    return this.questions.length > 0;
  }

  trackByIndex = (i: number) => i;

  qChoices(i: number): UntypedFormArray {
    return this.questions.at(i).get('choices') as UntypedFormArray;
  }

  // ---------- Builders ----------
  private makeChoice(text = '', isCorrect = false): UntypedFormGroup {
    return this.fb.group({
      id: [null],
      text: [text, [Validators.required, Validators.minLength(1)]],
      isCorrect: [isCorrect],
    });
  }

  private makeQuestion(type = 0): UntypedFormGroup {
    const fg = this.fb.group({
      id: [null],
      type: [type, Validators.required],
      prompt: ['', [Validators.required, Validators.minLength(2)]],
      points: [1, [Validators.required, Validators.min(1)]],
      choices: this.fb.array([]),
      correctAnswerText: [''],
      matchType: [0],
    });

    // seed defaults based on type
    this.seedByType(fg, type);

    // react to type changes
    fg.get('type')!.valueChanges.subscribe((t: number) => {
      this.seedByType(fg, Number(t));
    });

    return fg;
  }

  // Ensure the question's inner structure matches the selected type
  private seedByType(qFg: UntypedFormGroup, type: number) {
    const choices = qFg.get('choices') as UntypedFormArray;

    // Short answer => no choices
    if (type === 2) {
      choices.clear();
      // keep correctAnswerText/matchType available
      if (qFg.get('matchType')?.value == null) qFg.get('matchType')?.setValue(0, { emitEvent: false });
      return;
    }

    // MCQ / TF => must have choices
    // If switching from short => create minimal choices
    if (choices.length === 0) {
      if (type === 1) {
        choices.push(this.makeChoice('True', true));
        choices.push(this.makeChoice('False', false));
      } else {
        choices.push(this.makeChoice('Option 1', true));
        choices.push(this.makeChoice('Option 2', false));
      }
      return;
    }

    // If switching to TF, enforce exactly True/False
    if (type === 1) {
      // Replace choices with True/False, but try to preserve correct if possible
      const anyCorrect = choices.controls.some(c => !!c.value?.isCorrect);
      choices.clear();
      choices.push(this.makeChoice('True', anyCorrect ? true : true));
      choices.push(this.makeChoice('False', false));
      this.ensureExactlyOneCorrect(choices);
      return;
    }

    // If switching to MCQ, ensure at least 2 choices and one correct
    if (type === 0) {
      while (choices.length < 2) {
        choices.push(this.makeChoice(`Option ${choices.length + 1}`, false));
      }
      this.ensureExactlyOneCorrect(choices);
    }
  }

  private ensureExactlyOneCorrect(arr: UntypedFormArray) {
    if (arr.length === 0) return;

    // If none correct, set first correct
    const anyCorrect = arr.controls.some((c) => !!c.value?.isCorrect);
    if (!anyCorrect) {
      arr.at(0).patchValue({ isCorrect: true }, { emitEvent: false });
    }

    // If multiple correct, keep first only
    let found = false;
    for (let i = 0; i < arr.length; i++) {
      const isCorrect = !!arr.at(i).value?.isCorrect;
      if (isCorrect && !found) {
        found = true;
        continue;
      }
      if (isCorrect && found) {
        arr.at(i).patchValue({ isCorrect: false }, { emitEvent: false });
      }
    }
  }

  // ---------- Load ----------
  load() {
    this.loading = true;

    this.api.getLessonQuiz(this.lessonId).subscribe({
      next: (q: any) => {
        this.loading = false;

        // API returns null if not created yet
        if (!q) {
          this.quiz = null;
          this.questions.clear();
          this.form.patchValue({ title: 'Quiz' });
          return;
        }

        this.quiz = q as QuizDto;

        this.form.patchValue({ title: q.title ?? 'Quiz' });
        this.questions.clear();

        for (const qq of q.questions ?? []) {
          const fg = this.fb.group({
            id: [qq.id ?? null],
            type: [qq.type ?? 0, Validators.required],
            prompt: [qq.prompt ?? '', [Validators.required, Validators.minLength(2)]],
            points: [qq.points ?? 1, [Validators.required, Validators.min(1)]],
            choices: this.fb.array([]),
            correctAnswerText: [qq.correctAnswerText ?? ''],
            matchType: [qq.matchType ?? 0],
          });

          const choicesArr = fg.get('choices') as UntypedFormArray;

          // hydrate choices
          for (const c of qq.choices ?? []) {
            choicesArr.push(
              this.fb.group({
                id: [c.id ?? null],
                text: [c.text ?? '', [Validators.required, Validators.minLength(1)]],
                isCorrect: [!!c.isCorrect],
              })
            );
          }

          // normalize by type (ensures TF has 2, MCQ has at least 2, short clears)
          this.seedByType(fg, Number(qq.type ?? 0));

          // subscribe to type changes after initial seed
          fg.get('type')!.valueChanges.subscribe((t: number) => {
            this.seedByType(fg, Number(t));
          });

          this.questions.push(fg);
        }
      },
      error: (err) => {
        this.loading = false;
        this.toast.error(typeof err?.error === 'string' ? err.error : 'Failed to load quiz.');
      },
    });
  }

  // ---------- UI actions ----------
  addQuestion(type: number) {
    this.questions.push(this.makeQuestion(type));
  }

  removeQuestion(i: number) {
    this.questions.removeAt(i);
  }

  addChoice(qIndex: number) {
    const arr = this.qChoices(qIndex);
    arr.push(this.makeChoice(`Option ${arr.length + 1}`, false));
    this.ensureExactlyOneCorrect(arr);
  }

  removeChoice(qIndex: number, cIndex: number) {
    const arr = this.qChoices(qIndex);
    arr.removeAt(cIndex);
    this.ensureExactlyOneCorrect(arr);
  }

  // make sure MCQ/TF has exactly one correct (simple UX)
  markCorrect(qIndex: number, cIndex: number) {
    const arr = this.qChoices(qIndex);
    for (let i = 0; i < arr.length; i++) {
      arr.at(i).patchValue({ isCorrect: i === cIndex }, { emitEvent: false });
    }
  }

  // ---------- Save ----------
  save() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.error('Please fix validation errors.');
      return;
    }

    const v: any = this.form.value;

    // extra safety: normalize before save
    for (let i = 0; i < this.questions.length; i++) {
      const qFg = this.questions.at(i) as UntypedFormGroup;
      this.seedByType(qFg, Number(qFg.get('type')!.value));
    }

    const payload = {
      title: v.title,
      questions: (v.questions ?? []).map((q: any) => ({
        id: q.id ?? null,
        type: q.type,
        prompt: q.prompt,
        points: q.points,
        choices:
          q.type === 2
            ? null
            : (q.choices ?? []).map((c: any) => ({
                id: c.id ?? null,
                text: c.text,
                isCorrect: !!c.isCorrect,
              })),
        correctAnswerText: q.type === 2 ? (q.correctAnswerText ?? null) : null,
        matchType: q.type === 2 ? (q.matchType ?? 0) : null,
      })),
    };

    this.saving = true;

    this.api.upsertLessonQuiz(this.lessonId, payload).subscribe({
      next: () => {
        this.saving = false;
        this.toast.success('Quiz saved.');
        this.load();
      },
      error: (err) => {
        this.saving = false;
        this.toast.error(typeof err?.error === 'string' ? err.error : 'Save failed.');
      },
    });
  }
}