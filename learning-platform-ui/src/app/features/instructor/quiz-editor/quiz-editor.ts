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

  get questions(): UntypedFormArray {
    return this.form.get('questions') as UntypedFormArray;
  }

  qChoices(i: number): UntypedFormArray {
    return (this.questions.at(i).get('choices') as UntypedFormArray);
  }

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

    const choices = fg.get('choices') as UntypedFormArray;

    // Seed defaults
    if (type === 1) {
      choices.push(this.makeChoice('True', true));
      choices.push(this.makeChoice('False', false));
    } else if (type === 0) {
      choices.push(this.makeChoice('Option 1', true));
      choices.push(this.makeChoice('Option 2', false));
    }

    return fg;
  }

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
          for (const c of qq.choices ?? []) {
            choicesArr.push(
              this.fb.group({
                id: [c.id ?? null],
                text: [c.text ?? '', [Validators.required, Validators.minLength(1)]],
                isCorrect: [!!c.isCorrect],
              })
            );
          }

          // ensure TF always has 2
          if ((qq.type ?? 0) === 1 && choicesArr.length === 0) {
            choicesArr.push(this.makeChoice('True', true));
            choicesArr.push(this.makeChoice('False', false));
          }

          this.questions.push(fg);
        }
      },
      error: (err) => {
        this.loading = false;
        this.toast.error(typeof err?.error === 'string' ? err.error : 'Failed to load quiz.');
      },
    });
  }

  addQuestion(type: number) {
    this.questions.push(this.makeQuestion(type));
  }

  removeQuestion(i: number) {
    this.questions.removeAt(i);
  }

  addChoice(qIndex: number) {
    this.qChoices(qIndex).push(this.makeChoice('', false));
  }

  removeChoice(qIndex: number, cIndex: number) {
    this.qChoices(qIndex).removeAt(cIndex);
  }

  // make sure MCQ has exactly one correct (simple UX)
  markCorrect(qIndex: number, cIndex: number) {
    const arr = this.qChoices(qIndex);
    for (let i = 0; i < arr.length; i++) {
      arr.at(i).patchValue({ isCorrect: i === cIndex }, { emitEvent: false });
    }
  }

  save() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.error('Please fix validation errors.');
      return;
    }

    const v: any = this.form.value;

    const payload = {
      title: v.title,
      questions: (v.questions ?? []).map((q: any) => ({
        id: q.id ?? null,
        type: q.type,
        prompt: q.prompt,
        points: q.points,
        choices: q.type === 2
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
