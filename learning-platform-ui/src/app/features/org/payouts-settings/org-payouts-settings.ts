import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map, startWith, switchMap, tap } from 'rxjs/operators';
import {
  OrgApi,
  PayoutSettingsResponse
} from '../../../core/services/org-api';

type LoadState<T> = {
  loading: boolean;
  data: T | null;
  error: string | null;
};

@Component({
  selector: 'app-org-payouts-settings',
  standalone: true,
  imports: [CommonModule, RouterModule, ReactiveFormsModule],
  templateUrl: './org-payouts-settings.html',
  styleUrl: './org-payouts-settings.scss',
})
export class OrgPayoutSettingsComponent {
  academyId = '';
  saving = false;
  saveMessage: string | null = null;
  saveError: string | null = null;

  private reload$ = new BehaviorSubject<void>(undefined);

  days = [
    { label: 'Sunday', value: 0 },
    { label: 'Monday', value: 1 },
    { label: 'Tuesday', value: 2 },
    { label: 'Wednesday', value: 3 },
    { label: 'Thursday', value: 4 },
    { label: 'Friday', value: 5 },
    { label: 'Saturday', value: 6 },
  ];

  form: FormGroup;

  state$: Observable<LoadState<PayoutSettingsResponse>> = this.reload$.pipe(
    switchMap(() =>
      this.api.getPayoutSettings(this.academyId).pipe(
        tap((data) => {
          this.form.patchValue({
            platformFeePercent: data.platformFeePercent,
            organizationFeePercent: data.organizationFeePercent,
            instructorFeePercent: data.instructorFeePercent,
            weeklyAutoReleaseEnabled: data.weeklyAutoReleaseEnabled,
            weeklyReleaseDay: data.weeklyReleaseDay,
            currency: data.currency
          });
        }),
        map((data) => ({ loading: false, data, error: null } as LoadState<PayoutSettingsResponse>)),
        startWith({ loading: true, data: null, error: null } as LoadState<PayoutSettingsResponse>),
        catchError((err) =>
          of({
            loading: false,
            data: null,
            error: typeof err?.error === 'string' ? err.error : 'Failed to load payout settings.',
          } as LoadState<PayoutSettingsResponse>)
        )
      )
    )
  );

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private api: OrgApi,
    private fb: FormBuilder
  ) {
    this.academyId = this.route.snapshot.paramMap.get('academyId') || '';
    this.form = this.fb.group({
      platformFeePercent: [10, [Validators.required]],
      organizationFeePercent: [20, [Validators.required]],
      instructorFeePercent: [70, [Validators.required]],
      weeklyAutoReleaseEnabled: [true, [Validators.required]],
      weeklyReleaseDay: [5, [Validators.required]],
      currency: ['EUR', [Validators.required]]
    });
  }

  get totalPercent(): number {
    return Number(this.form.value.platformFeePercent || 0)
      + Number(this.form.value.organizationFeePercent || 0)
      + Number(this.form.value.instructorFeePercent || 0);
  }

  save() {
    if (this.saving) return;

    this.saveMessage = null;
    this.saveError = null;

    if (this.totalPercent !== 100) {
      this.saveError = 'Platform, organization, and instructor percentages must total 100.';
      return;
    }

    this.saving = true;

    this.api.updatePayoutSettings(this.academyId, {
      platformFeePercent: Number(this.form.value.platformFeePercent || 0),
      organizationFeePercent: Number(this.form.value.organizationFeePercent || 0),
      instructorFeePercent: Number(this.form.value.instructorFeePercent || 0),
      weeklyAutoReleaseEnabled: !!this.form.value.weeklyAutoReleaseEnabled,
      weeklyReleaseDay: Number(this.form.value.weeklyReleaseDay || 0),
      currency: (this.form.value.currency || 'EUR').trim().toUpperCase()
    }).subscribe({
      next: () => {
        this.saving = false;
        this.saveMessage = 'Payout settings updated successfully.';
        this.saveError = null;
        this.reload$.next();
      },
      error: (err) => {
        this.saving = false;
        this.saveMessage = null;
        this.saveError = typeof err?.error === 'string' ? err.error : 'Failed to save payout settings.';
      }
    });
  }

  goPayouts() {
    this.router.navigateByUrl(`/org/payouts/${this.academyId}`);
  }
}