import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import {
  FormArray,
  ReactiveFormsModule,
  UntypedFormBuilder,
  UntypedFormGroup,
  Validators,
} from '@angular/forms';
import {
  AiFlashcardGenerateRequest,
  FlashcardDto,
  InstructorApi,
} from '../../../core/services/instructor-api';
import { ToastService } from '../../../shared/ui/toast.service';

@Component({
  selector: 'app-flashcards-editor',
  standalone: true,
  imports: [CommonModule, RouterModule, ReactiveFormsModule],
  templateUrl: './flashcards-editor.html',
  styleUrl: './flashcards-editor.scss',
})
export class FlashcardsEditorComponent implements OnInit {
  lessonId = '';

  loading = false;
  saving = false;
  aiGenerating = false;
  publishLoading = false;
  aiModalOpen = false;

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
      cards: this.fb.array([]),
    });

    this.aiForm = this.fb.group({
      topic: [''],
      instructions: [''],
      count: [8, [Validators.required, Validators.min(1), Validators.max(20)]],
      difficulty: ['Beginner', Validators.required],
    });
  }

  ngOnInit(): void {
    this.load();
  }

  get cards(): FormArray {
    return this.form.get('cards') as FormArray;
  }

  get cardCount(): number {
    return this.cards.length;
  }

  get hasCards(): boolean {
    return this.cards.length > 0;
  }

  // FIX 1: trackBy was using index — reorders caused full re-renders of all cards.
  // Now uses the card's persisted id when available, falling back to index only for
  // unsaved (id === null) cards.
  trackByCard = (i: number, _: any): string | number => {
    const id = this.cards.at(i)?.get('id')?.value;
    return id != null ? id : `new-${i}`;
  };

  private makeCard(card?: Partial<FlashcardDto>): UntypedFormGroup {
    return this.fb.group({
      id: [card?.id ?? null],
      question: [card?.question ?? '', [Validators.required, Validators.minLength(2)]],
      answer: [card?.answer ?? '', [Validators.required, Validators.minLength(1)]],
      orderIndex: [card?.orderIndex ?? this.cards.length],
      isPublished: [card?.isPublished ?? false],
    });
  }

  private normalizeOrder(): void {
    for (let i = 0; i < this.cards.length; i++) {
      this.cards.at(i).patchValue({ orderIndex: i }, { emitEvent: false });
    }
  }

  load(): void {
    if (!this.lessonId) return;

    this.loading = true;

    this.api.getLessonFlashcards(this.lessonId).subscribe({
      next: (items) => {
        this.loading = false;
        this.cards.clear();

        for (const item of items ?? []) {
          this.cards.push(this.makeCard(item));
        }

        this.normalizeOrder();
      },
      error: (err) => {
        this.loading = false;
        const msg =
          typeof err?.error === 'string'
            ? err.error
            : 'Failed to load flashcards.';
        this.toast.error(msg);
      },
    });
  }

  addCard(): void {
    this.cards.push(
      this.makeCard({
        question: '',
        answer: '',
        orderIndex: this.cards.length,
        isPublished: false,
      })
    );
    this.normalizeOrder();
  }

  removeCard(index: number): void {
    this.cards.removeAt(index);
    this.normalizeOrder();
  }

  // FIX 2: moveUp/moveDown previously used setControl which Angular marks as replacing
  // the control — this causes validation state and dirty/touched flags to be lost on the
  // swapped control. Use getRawValue + setValue round-trip to swap values in-place instead,
  // preserving both control instances and their validation state.
  moveUp(index: number): void {
    if (index <= 0) return;

    const currentVal = this.cards.at(index).getRawValue();
    const prevVal    = this.cards.at(index - 1).getRawValue();

    this.cards.at(index).setValue(prevVal,    { emitEvent: false });
    this.cards.at(index - 1).setValue(currentVal, { emitEvent: false });

    this.normalizeOrder();
  }

  moveDown(index: number): void {
    if (index >= this.cards.length - 1) return;

    const currentVal = this.cards.at(index).getRawValue();
    const nextVal    = this.cards.at(index + 1).getRawValue();

    this.cards.at(index).setValue(nextVal,     { emitEvent: false });
    this.cards.at(index + 1).setValue(currentVal, { emitEvent: false });

    this.normalizeOrder();
  }

  openAiModal(): void {
    this.aiModalOpen = true;
  }

  closeAiModal(): void {
    if (this.aiGenerating) return;
    this.aiModalOpen = false;
  }

  generateWithAi(): void {
    if (this.aiForm.invalid) {
      this.aiForm.markAllAsTouched();
      this.toast.error('Please complete the AI form.');
      return;
    }

    const payload: AiFlashcardGenerateRequest = {
      topic: this.aiForm.value.topic || null,
      instructions: this.aiForm.value.instructions || null,
      count: Number(this.aiForm.value.count ?? 8),
      difficulty: this.aiForm.value.difficulty || 'Beginner',
    };

    this.aiGenerating = true;

    this.api.generateLessonFlashcardsWithAi(this.lessonId, payload).subscribe({
      next: (items) => {
        this.aiGenerating = false;

        if (!items || items.length === 0) {
          this.toast.error('AI did not return any flashcards.');
          return;
        }

        for (const item of items) {
          this.cards.push(
            this.makeCard({
              id: null,
              question: item.question,
              answer: item.answer,
              orderIndex: this.cards.length,
              isPublished: false,
            })
          );
        }

        this.normalizeOrder();
        this.aiModalOpen = false;
        this.toast.success('AI flashcards added to draft.');
      },
      error: (err) => {
        this.aiGenerating = false;
        const msg =
          typeof err?.error === 'string'
            ? err.error
            : 'Failed to generate flashcards with AI.';
        this.toast.error(msg);
      },
    });
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.error('Please fix validation errors.');
      return;
    }

    this.normalizeOrder();

    const payload: FlashcardDto[] = (this.form.getRawValue().cards ?? []).map(
      (x: any, i: number) => ({
        id: x.id ?? null,
        question: String(x.question ?? '').trim(),
        answer: String(x.answer ?? '').trim(),
        orderIndex: i,
        isPublished: !!x.isPublished,
      })
    );

    this.saving = true;

    this.api.upsertLessonFlashcards(this.lessonId, payload).subscribe({
      next: (items) => {
        this.saving = false;
        this.cards.clear();

        for (const item of items ?? []) {
          this.cards.push(this.makeCard(item));
        }

        this.normalizeOrder();
        this.toast.success('Flashcards saved.');
      },
      error: (err) => {
        this.saving = false;
        const msg =
          typeof err?.error === 'string'
            ? err.error
            : 'Failed to save flashcards.';
        this.toast.error(msg);
      },
    });
  }

  publishAll(): void {
    this.publishLoading = true;

    this.api.publishLessonFlashcards(this.lessonId).subscribe({
      next: (items) => {
        this.publishLoading = false;
        this.cards.clear();

        for (const item of items ?? []) {
          this.cards.push(this.makeCard(item));
        }

        this.normalizeOrder();
        this.toast.success('Flashcards published.');
      },
      error: (err) => {
        this.publishLoading = false;
        const msg =
          typeof err?.error === 'string'
            ? err.error
            : 'Failed to publish flashcards.';
        this.toast.error(msg);
      },
    });
  }

  unpublishAll(): void {
    this.publishLoading = true;

    this.api.unpublishLessonFlashcards(this.lessonId).subscribe({
      next: (items) => {
        this.publishLoading = false;
        this.cards.clear();

        for (const item of items ?? []) {
          this.cards.push(this.makeCard(item));
        }

        this.normalizeOrder();
        this.toast.success('Flashcards unpublished.');
      },
      error: (err) => {
        this.publishLoading = false;
        const msg =
          typeof err?.error === 'string'
            ? err.error
            : 'Failed to unpublish flashcards.';
        this.toast.error(msg);
      },
    });
  }
}