import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Observable, of } from 'rxjs';
import { catchError, map, startWith, switchMap } from 'rxjs/operators';
import { MyPurchaseDetailResponse, StudentApi } from '../../../core/services/student-api';

type LoadState<T> = {
  loading: boolean;
  data: T | null;
  error: string | null;
};

@Component({
  selector: 'app-purchase-detail',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './purchase-detail.html',
  styleUrl: './purchase-detail.scss',
})
export class PurchaseDetailComponent {
  paymentId = '';
  state$: Observable<LoadState<MyPurchaseDetailResponse>>;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private student: StudentApi
  ) {
    this.paymentId = this.route.snapshot.paramMap.get('paymentId') || '';

    this.state$ = this.route.paramMap.pipe(
      map((params) => params.get('paymentId') || ''),
      switchMap((paymentId) => {
        this.paymentId = paymentId;

        if (!paymentId) {
          return of({
            loading: false,
            data: null,
            error: 'Missing payment ID.',
          } as LoadState<MyPurchaseDetailResponse>);
        }

        return this.student.myPurchaseDetail(paymentId).pipe(
          map((data) => ({ loading: false, data, error: null } as LoadState<MyPurchaseDetailResponse>)),
          startWith({ loading: true, data: null, error: null } as LoadState<MyPurchaseDetailResponse>),
          catchError((err) =>
            of({
              loading: false,
              data: null,
              error: typeof err?.error === 'string' ? err.error : 'Failed to load purchase detail.',
            } as LoadState<MyPurchaseDetailResponse>)
          )
        );
      })
    );
  }

  statusClass(status: string): string {
    return (status || '').toLowerCase();
  }

  money(amount: number, currency: string): string {
    return `${amount} ${currency}`;
  }

  when(value?: string | null): string {
    if (!value) return '—';
    const t = Date.parse(value);
    return Number.isFinite(t) ? new Date(t).toLocaleString() : value;
  }

  goCourse(courseId: string) {
    this.router.navigateByUrl(`/course/${courseId}`);
  }

  goPurchases() {
    this.router.navigateByUrl('/purchases');
  }
}