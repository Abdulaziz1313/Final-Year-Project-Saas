import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable, of } from 'rxjs';
import { catchError, map, startWith, tap } from 'rxjs/operators';

import { OrgApi, OrgAcademyDetail, UpdateAcademyRequest } from '../../../core/services/org-api';
import { ConfirmService } from '../../../shared/ui/confirm.service';
import { environment } from '../../../../environments/environment';

type LoadState<T> = {
  loading: boolean;
  data: T | null;
  error: string | null;
};

@Component({
  selector: 'app-org-academy-edit',
  standalone: true,
  imports: [CommonModule, RouterModule, ReactiveFormsModule],
  templateUrl: './org-academy-edit.html',
  styleUrl: './org-academy-edit.scss',
})
export class OrgAcademyEditComponent {
  academyId = '';
  saving = false;
  saveMessage: string | null = null;
  saveError: string | null = null;

  uploadingLogo = false;
  uploadingBanner = false;
  removingLogo = false;
  removingBanner = false;

  logoError: string | null = null;
  bannerError: string | null = null;
  logoMessage: string | null = null;
  bannerMessage: string | null = null;

  logoPreview: string | null = null;
  bannerPreview: string | null = null;

  apiBase = environment.apiBaseUrl;

  form: FormGroup;
  state$: Observable<LoadState<OrgAcademyDetail>>;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private fb: FormBuilder,
    private orgApi: OrgApi,
    private confirm: ConfirmService
  ) {
    this.academyId = this.route.snapshot.paramMap.get('academyId') || '';

    this.form = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      slug: ['', [Validators.required, Validators.minLength(2)]],
      description: [''],
      website: [''],
      primaryColor: ['#1a56db', [Validators.required]],
      fontKey: ['system'],
    });

    this.state$ = this.orgApi.getAcademy(this.academyId).pipe(
      tap((academy) => {
        this.logoPreview = this.fullUrl(academy.logoUrl);
        this.bannerPreview = this.fullUrl(academy.bannerUrl);

        this.form.patchValue({
          name: academy.name ?? '',
          slug: academy.slug ?? '',
          description: academy.description ?? '',
          website: academy.website ?? '',
          primaryColor: academy.primaryColor ?? '#1a56db',
          fontKey: academy.fontKey ?? 'system',
        });
      }),
      map((data) => ({
        loading: false,
        data,
        error: null,
      }) as LoadState<OrgAcademyDetail>),
      startWith({
        loading: true,
        data: null,
        error: null,
      } as LoadState<OrgAcademyDetail>),
      catchError((err) =>
        of({
          loading: false,
          data: null,
          error: typeof err?.error === 'string' ? err.error : 'Failed to load academy.',
        } as LoadState<OrgAcademyDetail>)
      )
    );
  }

  get nameCtrl() { return this.form.get('name'); }
  get slugCtrl() { return this.form.get('slug'); }
  get websiteCtrl() { return this.form.get('website'); }
  get descriptionCtrl() { return this.form.get('description'); }
  get primaryColorCtrl() { return this.form.get('primaryColor'); }
  get fontKeyCtrl() { return this.form.get('fontKey'); }

  save() {
    if (this.saving) return;

    this.saveMessage = null;
    this.saveError = null;

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving = true;

    const value = this.form.value;

    const payload: UpdateAcademyRequest = {
      name: (value.name || '').trim(),
      slug: (value.slug || '').trim(),
      description: (value.description || '').trim() || null,
      website: (value.website || '').trim() || null,
      primaryColor: (value.primaryColor || '').trim() || null,
      fontKey: (value.fontKey || 'system').trim() || 'system',
    };

    this.orgApi.updateAcademy(this.academyId, payload).subscribe({
      next: (academy) => {
        this.saving = false;
        this.saveMessage = 'Academy updated successfully.';
        this.saveError = null;
        this.logoPreview = this.fullUrl(academy.logoUrl);
        this.bannerPreview = this.fullUrl(academy.bannerUrl);
      },
      error: (err) => {
        this.saving = false;
        this.saveMessage = null;
        this.saveError = typeof err?.error === 'string' ? err.error : 'Failed to update academy.';
      },
    });
  }

  submit() {
    this.save();
  }

  goBack() {
    this.router.navigateByUrl('/org/academies');
  }

  slugifyFromName() {
    const name = (this.form.value.name || '') as string;
    const slug = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    this.form.patchValue({ slug });
  }

  onLogoSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.logoError = null;
    this.logoMessage = null;

    if (!this.isImage(file)) {
      this.logoError = 'Please select a valid image file for the logo.';
      input.value = '';
      return;
    }

    this.uploadingLogo = true;

    this.orgApi.uploadAcademyLogo(this.academyId, file).subscribe({
      next: (res) => {
        this.uploadingLogo = false;
        this.logoPreview = this.fullUrl(res?.logoUrl) + `?t=${Date.now()}`;
        this.logoMessage = 'Logo uploaded successfully.';
        input.value = '';
      },
      error: (err) => {
        this.uploadingLogo = false;
        this.logoError = typeof err?.error === 'string' ? err.error : 'Failed to upload logo.';
        input.value = '';
      },
    });
  }

  onBannerSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.bannerError = null;
    this.bannerMessage = null;

    if (!this.isImage(file)) {
      this.bannerError = 'Please select a valid image file for the banner.';
      input.value = '';
      return;
    }

    this.uploadingBanner = true;

    this.orgApi.uploadAcademyBanner(this.academyId, file).subscribe({
      next: (res) => {
        this.uploadingBanner = false;
        this.bannerPreview = this.fullUrl(res?.bannerUrl) + `?t=${Date.now()}`;
        this.bannerMessage = 'Banner uploaded successfully.';
        input.value = '';
      },
      error: (err) => {
        this.uploadingBanner = false;
        this.bannerError = typeof err?.error === 'string' ? err.error : 'Failed to upload banner.';
        input.value = '';
      },
    });
  }

  async removeLogo() {
    if (!this.logoPreview || this.removingLogo) return;

    const confirmed = await this.confirm.open({
      title: 'Delete academy logo?',
      message: 'This will remove the current academy logo. You can upload a new one anytime.',
      confirmText: 'Delete logo',
      cancelText: 'Cancel',
    });

    if (!confirmed) return;

    this.logoError = null;
    this.logoMessage = null;
    this.removingLogo = true;

    const api = this.orgApi as any;
    if (!api.deleteAcademyLogo) {
      this.removingLogo = false;
      this.logoError = 'deleteAcademyLogo() is missing in OrgApi.';
      return;
    }

    api.deleteAcademyLogo(this.academyId).subscribe({
      next: () => {
        this.removingLogo = false;
        this.logoPreview = null;
        this.logoMessage = 'Logo deleted successfully.';
      },
      error: (err: any) => {
        this.removingLogo = false;
        this.logoError = typeof err?.error === 'string' ? err.error : 'Failed to delete logo.';
      },
    });
  }

  async removeBanner() {
    if (!this.bannerPreview || this.removingBanner) return;

    const confirmed = await this.confirm.open({
      title: 'Delete academy banner?',
      message: 'This will remove the current academy banner. You can upload a new one anytime.',
      confirmText: 'Delete banner',
      cancelText: 'Cancel',
    });

    if (!confirmed) return;

    this.bannerError = null;
    this.bannerMessage = null;
    this.removingBanner = true;

    const api = this.orgApi as any;
    if (!api.deleteAcademyBanner) {
      this.removingBanner = false;
      this.bannerError = 'deleteAcademyBanner() is missing in OrgApi.';
      return;
    }

    api.deleteAcademyBanner(this.academyId).subscribe({
      next: () => {
        this.removingBanner = false;
        this.bannerPreview = null;
        this.bannerMessage = 'Banner deleted successfully.';
      },
      error: (err: any) => {
        this.removingBanner = false;
        this.bannerError = typeof err?.error === 'string' ? err.error : 'Failed to delete banner.';
      },
    });
  }

  fullUrl(url?: string | null): string | null {
    if (!url) return null;
    return url.startsWith('http') ? url : `${this.apiBase}${url}`;
  }

  academyInitial(): string {
    const name = (this.form.value.name || '').trim();
    return (name || 'A').charAt(0).toUpperCase();
  }

  private isImage(file: File): boolean {
    return ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml'].includes(file.type);
  }
}