import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map, startWith, switchMap } from 'rxjs/operators';
import { StudentApi, MyPurchasesResponse, PaymentStatus } from '../../../core/services/student-api';
import { environment } from '../../../../environments/environment';

type LoadState<T> = {
  loading: boolean;
  data: T | null;
  error: string | null;
};

@Component({
  selector: 'app-purchases',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './purchases.html',
  styleUrl: './purchases.scss',
})
export class PurchasesComponent {
  private reload$ = new BehaviorSubject<void>(undefined);

  statusFilter = '';
  page = 1;
  pageSize = 12;

  state$: Observable<LoadState<MyPurchasesResponse>> = this.reload$.pipe(
    switchMap(() =>
      this.student.myPurchases(this.statusFilter, this.page, this.pageSize).pipe(
        map((data) => ({ loading: false, data, error: null } as LoadState<MyPurchasesResponse>)),
        startWith({ loading: true, data: null, error: null } as LoadState<MyPurchasesResponse>),
        catchError((err) =>
          of({
            loading: false,
            data: null,
            error: typeof err?.error === 'string' ? err.error : 'Failed to load purchases.',
          } as LoadState<MyPurchasesResponse>)
        )
      )
    )
  );

  statuses: Array<{ label: string; value: string }> = [
    { label: 'All', value: '' },
    { label: 'Paid', value: 'Paid' },
    { label: 'Pending', value: 'Pending' },
    { label: 'Failed', value: 'Failed' },
    { label: 'Cancelled', value: 'Cancelled' },
  ];

  constructor(
    private student: StudentApi,
    private router: Router
  ) {}

  img(url?: string | null) {
    if (!url) return null;
    return url.startsWith('http') ? url : `${environment.apiBaseUrl}${url}`;
  }

  reload() {
    this.reload$.next();
  }

  setStatus(value: string) {
    this.statusFilter = value;
    this.page = 1;
    this.reload();
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

  openDetail(paymentId: string) {
    this.router.navigateByUrl(`/purchases/${paymentId}`);
  }

  continueCourse(courseId: string) {
    this.router.navigateByUrl(`/course/${courseId}`);
  }

  statusClass(status: PaymentStatus | string): string {
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

  totalPages(total: number): number {
    return Math.max(1, Math.ceil(total / this.pageSize));
  }
}