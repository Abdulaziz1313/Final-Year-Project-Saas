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
import {
  InstructorApi,
  AiQuizDraftDto,
} from '../../../core/services/instructor-api';
import { ToastService } from '../../../shared/ui/toast.service';

type QuizDto = {
  id: string;
  title: string;
  questions: Array<{
    id: string;
    type: number;
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
  aiGenerating = false;
  aiModalOpen = false;

  quiz: QuizDto | null = null;

  form: UntypedFormGroup;
  aiForm: UntypedFormGroup;

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

    this.aiForm = this.fb.group({
      topic: ['', [Validators.required, Validators.minLength(2)]],
      instructions: [''],
      questionCount: [5, [Validators.required, Validators.min(1), Validators.max(20)]],
      difficulty: ['Beginner', Validators.required],
    });
  }

  ngOnInit() {
    this.load();
  }

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

    this.seedByType(fg, type);

    fg.get('type')!.valueChanges.subscribe((t: number) => {
      this.seedByType(fg, Number(t));
    });

    return fg;
  }

  private seedByType(qFg: UntypedFormGroup, type: number) {
    const choices = qFg.get('choices') as UntypedFormArray;

    if (type === 2) {
      choices.clear();
      if (qFg.get('matchType')?.value == null) {
        qFg.get('matchType')?.setValue(0, { emitEvent: false });
      }
      return;
    }

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

    if (type === 1) {
      const anyCorrect = choices.controls.some(c => !!c.value?.isCorrect);
      choices.clear();
      choices.push(this.makeChoice('True', anyCorrect ? true : true));
      choices.push(this.makeChoice('False', false));
      this.ensureExactlyOneCorrect(choices);
      return;
    }

    if (type === 0) {
      while (choices.length < 2) {
        choices.push(this.makeChoice(`Option ${choices.length + 1}`, false));
      }
      this.ensureExactlyOneCorrect(choices);
    }
  }

  private ensureExactlyOneCorrect(arr: UntypedFormArray) {
    if (arr.length === 0) return;

    const anyCorrect = arr.controls.some((c) => !!c.value?.isCorrect);
    if (!anyCorrect) {
      arr.at(0).patchValue({ isCorrect: true }, { emitEvent: false });
    }

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

  load() {
    this.loading = true;

    this.api.getLessonQuiz(this.lessonId).subscribe({
      next: (q: any) => {
        this.loading = false;

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

          this.seedByType(fg, Number(qq.type ?? 0));

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

  markCorrect(qIndex: number, cIndex: number) {
    const arr = this.qChoices(qIndex);
    for (let i = 0; i < arr.length; i++) {
      arr.at(i).patchValue({ isCorrect: i === cIndex }, { emitEvent: false });
    }
  }

  openAiModal() {
    this.aiModalOpen = true;
  }

  closeAiModal() {
    if (this.aiGenerating) return;
    this.aiModalOpen = false;
  }

  private appendAiQuestions(items: AiQuizDraftDto[]) {
    for (const item of items ?? []) {
      const type = Number(item.type ?? 0);

      const fg = this.fb.group({
        id: [null],
        type: [type, Validators.required],
        prompt: [item.prompt ?? '', [Validators.required, Validators.minLength(2)]],
        points: [item.points ?? 1, [Validators.required, Validators.min(1)]],
        choices: this.fb.array([]),
        correctAnswerText: [item.correctAnswerText ?? ''],
        matchType: [item.matchType ?? 0],
      });

      const choicesArr = fg.get('choices') as UntypedFormArray;

      if (type !== 2) {
        for (const c of item.choices ?? []) {
          choicesArr.push(this.makeChoice(c.text ?? '', !!c.isCorrect));
        }
      }

      this.seedByType(fg, type);

      fg.get('type')!.valueChanges.subscribe((t: number) => {
        this.seedByType(fg, Number(t));
      });

      this.questions.push(fg);
    }
  }

  generateQuizWithAi() {
    if (this.aiForm.invalid) {
      this.aiForm.markAllAsTouched();
      this.toast.error('Please complete the AI quiz form.');
      return;
    }

    this.aiGenerating = true;

    this.api.generateLessonQuizWithAi(this.lessonId, this.aiForm.value).subscribe({
      next: (items: AiQuizDraftDto[]) => {
        this.aiGenerating = false;

        if (!items || items.length === 0) {
          this.toast.error('AI did not return any questions.');
          return;
        }

        this.appendAiQuestions(items);
        this.aiModalOpen = false;
        this.toast.success('AI quiz draft added.');
      },
      error: (err) => {
        this.aiGenerating = false;
        this.toast.error(
          typeof err?.error === 'string'
            ? err.error
            : 'Failed to generate quiz with AI.'
        );
      }
    });
  }

  save() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.error('Please fix validation errors.');
      return;
    }

    const v: any = this.form.value;

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