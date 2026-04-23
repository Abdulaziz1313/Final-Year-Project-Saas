import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map, startWith, switchMap } from 'rxjs/operators';
import {
  InstructorApi,
  InstructorEarningsResponse
} from '../../../core/services/instructor-api';

type LoadState<T> = {
  loading: boolean;
  data: T | null;
  error: string | null;
};

@Component({
  selector: 'app-earnings',
  standalone: true,
  imports: [CommonModule, RouterModule, ReactiveFormsModule],
  templateUrl: './earnings.html',
  styleUrl: './earnings.scss',
})
export class EarningsComponent {
  academyId = '';
  page = 1;
  pageSize = 20;

  private reload$ = new BehaviorSubject<void>(undefined);

  requesting = false;
  requestMessage: string | null = null;
  requestError: string | null = null;

  form: FormGroup;

  state$: Observable<LoadState<InstructorEarningsResponse>> = this.reload$.pipe(
    switchMap(() =>
      this.api.getInstructorEarnings(this.academyId, this.page, this.pageSize).pipe(
        map((data) => ({ loading: false, data, error: null } as LoadState<InstructorEarningsResponse>)),
        startWith({ loading: true, data: null, error: null } as LoadState<InstructorEarningsResponse>),
        catchError((err) =>
          of({
            loading: false,
            data: null,
            error: typeof err?.error === 'string' ? err.error : 'Failed to load earnings.',
          } as LoadState<InstructorEarningsResponse>)
        )
      )
    )
  );

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private api: InstructorApi,
    private fb: FormBuilder
  ) {
    this.academyId = this.route.snapshot.paramMap.get('academyId') || '';
    this.form = this.fb.group({
      note: ['']
    });
  }

  reload() {
    this.reload$.next();
  }

  requestPayoutNow() {
    if (!this.academyId || this.requesting) return;

    this.requesting = true;
    this.requestMessage = null;
    this.requestError = null;

    const note = (this.form.value.note || '').trim();

    this.api.requestPayoutNow(this.academyId, note || null).subscribe({
      next: (res) => {
        this.requesting = false;
        this.requestMessage = res.message || 'Your payout request was received.';
        this.requestError = null;
        this.reload();
      },
      error: (err) => {
        this.requesting = false;
        this.requestMessage = null;
        this.requestError = typeof err?.error === 'string' ? err.error : 'Failed to request payout.';
      }
    });
  }

  prevPage() {
    if (this.page <= 1) return;
    this.page--;
    this.reload();
  }

  nextPage(total: number) {
    const totalPages = Math.max(1, Math.ceil(total / this.pageSize));
    if (this.page >= totalPages) return;
    this.page++;
    this.reload();
  }

  totalPages(total: number) {
    return Math.max(1, Math.ceil(total / this.pageSize));
  }

  money(amount: number, currency = 'EUR'): string {
    return `${amount} ${currency}`;
  }

  when(value?: string | null): string {
    if (!value) return '—';
    const t = Date.parse(value);
    return Number.isFinite(t) ? new Date(t).toLocaleString() : value;
  }

  statusLabel(item: { isPaidOut: boolean; isReleasedForPayout: boolean }): string {
    if (item.isPaidOut) return 'Paid';
    if (item.isReleasedForPayout) return 'Processing';
    return 'Available';
  }

  statusClass(item: { isPaidOut: boolean; isReleasedForPayout: boolean }): string {
    if (item.isPaidOut) return 'paid';
    if (item.isReleasedForPayout) return 'processing';
    return 'available';
  }

  goRevenue() {
    this.router.navigateByUrl(`/instructor/revenue/${this.academyId}`);
  }
}