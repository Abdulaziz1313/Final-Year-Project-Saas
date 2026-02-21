import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { InstructorApi } from '../../../core/services/instructor-api';

@Component({
  selector: 'app-course-create',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './course-create.html',
  styleUrl: './course-create.scss',
})
export class CourseCreateComponent {
  academyId = '';
  loading = false;
  error: string | null = null;

  // Thumbnail
  thumbPreview: string | null = null;
  thumbFile: File | null = null;
  thumbName: string | null = null;
  dragThumb = false;

  // Tags
  tags: string[] = [];
  tagInput = '';

  // Limits
  readonly shortMax = 180;

  form;

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private api: InstructorApi,
    private router: Router
  ) {
    this.academyId = this.route.snapshot.paramMap.get('academyId') || '';

    this.form = this.fb.group({
      title: ['', [Validators.required, Validators.minLength(3)]],
      shortDescription: ['', [Validators.maxLength(this.shortMax)]],
      fullDescription: [''],
      category: [''],

      isFree: [true],
      price: [null],
      currency: ['EUR'],

      publishNow: [false],
      goToBuilder: [true],
    });

    this.form.get('isFree')!.valueChanges.subscribe((free) => {
      if (free) this.form.get('price')!.setValue(null);
    });
  }

  // --- getters ---
  get titleCtrl() { return this.form.get('title'); }
  get shortCtrl() { return this.form.get('shortDescription'); }
  get priceCtrl() { return this.form.get('price'); }

  shortCount(): number {
    return (this.form.value.shortDescription || '').length;
  }

  // price validation
  priceInvalid(): boolean {
    if (this.form.value.isFree) return false;
    const v = Number(this.priceCtrl?.value);
    return !Number.isFinite(v) || v <= 0;
  }

  // ---------- Tags ----------
  addTag() {
    const raw = (this.tagInput || '').trim().toLowerCase();
    if (!raw) return;

    // sanitize
    const safe = raw.replace(/[^a-z0-9-_]/g, '').slice(0, 24);
    if (!safe) return;

    if (this.tags.includes(safe)) {
      this.tagInput = '';
      return;
    }
    if (this.tags.length >= 10) return;

    this.tags.push(safe);
    this.tagInput = '';
  }

  removeTag(t: string) {
    this.tags = this.tags.filter(x => x !== t);
  }

  clearTags() {
    this.tags = [];
    this.tagInput = '';
  }

  // ---------- Thumbnail ----------
  onThumbSelected(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.acceptThumb(file, () => (input.value = ''));
  }

  onThumbDrop(ev: DragEvent) {
    ev.preventDefault();
    this.dragThumb = false;
    const file = ev.dataTransfer?.files?.[0];
    if (!file) return;
    this.acceptThumb(file);
  }

  onThumbDragOver(ev: DragEvent) {
    ev.preventDefault();
  }

  private acceptThumb(file: File, onReject?: () => void) {
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)) {
      alert('Please select JPG/PNG/WEBP');
      onReject?.();
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('Max 5MB');
      onReject?.();
      return;
    }

    this.thumbFile = file;
    this.thumbName = file.name;

    const reader = new FileReader();
    reader.onload = () => (this.thumbPreview = String(reader.result));
    reader.readAsDataURL(file);
  }

  clearThumb(fileInput?: HTMLInputElement) {
    this.thumbFile = null;
    this.thumbPreview = null;
    this.thumbName = null;
    this.dragThumb = false;
    if (fileInput) fileInput.value = '';
  }

  // ---------- Submit ----------
  submit() {
    this.error = null;

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const v = this.form.value;

    if (!v.isFree && this.priceInvalid()) {
      this.error = 'Paid courses must have a price greater than 0.';
      this.form.get('price')!.markAsTouched();
      return;
    }

    this.loading = true;

    const payload = {
      academyId: this.academyId,
      title: (v.title || '').trim(),
      shortDescription: (v.shortDescription || '').trim(),
      fullDescription: (v.fullDescription || '').trim(),
      isFree: !!v.isFree,
      price: v.isFree ? null : v.price,
      currency: v.currency || 'EUR',
      category: (v.category || '').trim(),
      tagsJson: JSON.stringify(this.tags),
    };

    this.api.createCourse(payload).subscribe({
      next: (res) => {
        const courseId = res.id;

        const finish = () => {
          this.loading = false;
          const goToBuilder = !!this.form.value.goToBuilder;
          if (goToBuilder) this.router.navigateByUrl(`/instructor/course-builder/${courseId}`);
          else this.router.navigate(['/instructor/courses', this.academyId]);
        };

        const doPublish = () => {
          if (this.form.value.publishNow) {
            this.api.publishCourse(courseId).subscribe({ next: () => finish(), error: () => finish() });
          } else {
            finish();
          }
        };

        if (this.thumbFile) {
          this.api.uploadCourseThumbnail(courseId, this.thumbFile).subscribe({
            next: () => doPublish(),
            error: () => doPublish(),
          });
        } else {
          doPublish();
        }
      },
      error: (err) => {
        this.loading = false;
        this.error = typeof err?.error === 'string' ? err.error : 'Failed to create course';
      },
    });
  }

  previewPrice(): string {
    const v = this.form.value;
    if (v.isFree) return 'Free';

    const currency = (v.currency || 'EUR').toUpperCase();
    const priceNum = Number(v.price);
    const price = Number.isFinite(priceNum) ? priceNum.toFixed(2) : '0.00';

    return `${currency} ${price}`;
  }
}
