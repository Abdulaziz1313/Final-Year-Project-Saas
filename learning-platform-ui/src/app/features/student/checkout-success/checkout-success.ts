import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Subject, Observable, of } from 'rxjs';
import { catchError, map, startWith, switchMap } from 'rxjs/operators';

import { StudentApi } from '../../../core/services/student-api';

type ViewState = {
  loading: boolean;
  ok: boolean;
  pending: boolean;
  notFound: boolean;
  title: string;
  message: string;
  amountLabel?: string | null;
  courseId?: string | null;
  courseTitle?: string | null;
};

@Component({
  selector: 'app-checkout-success',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './checkout-success.html',
  styleUrl: './checkout-success.scss',
})
export class CheckoutSuccessComponent implements OnDestroy {
  private destroy$ = new Subject<void>();

  sessionId = '';
  state$: Observable<ViewState>;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private student: StudentApi
  ) {
    this.sessionId = this.route.snapshot.queryParamMap.get('session_id') || '';

    this.state$ = this.route.queryParamMap.pipe(
      map((params) => params.get('session_id') || ''),
      switchMap((sessionId) => {
        this.sessionId = sessionId;

        if (!sessionId) {
          return of<ViewState>({
            loading: false,
            ok: false,
            pending: false,
            notFound: true,
            title: 'Missing session',
            message: 'We could not find the checkout session in the URL.',
            amountLabel: null,
            courseId: null,
            courseTitle: null,
          });
        }

        return this.student.getCheckoutSessionStatus(sessionId).pipe(
          map((res) => {
            const status = (res?.status || '').toLowerCase();
            const currency = (res?.currency || 'EUR').toUpperCase();
            const amount =
              typeof res?.amount === 'number'
                ? `${res.amount} ${currency}`
                : null;

            if (status === 'paid') {
              return {
                loading: false,
                ok: true,
                pending: false,
                notFound: false,
                title: 'Payment successful',
                message: 'Your payment was received and your course access is ready.',
                amountLabel: amount,
                courseId: res?.courseId ?? null,
                courseTitle: res?.courseTitle ?? null,
              } as ViewState;
            }

            if (status === 'pending') {
              return {
                loading: false,
                ok: false,
                pending: true,
                notFound: false,
                title: 'Payment processing',
                message: 'Your payment is still being confirmed. Refresh this page in a moment.',
                amountLabel: amount,
                courseId: res?.courseId ?? null,
                courseTitle: res?.courseTitle ?? null,
              } as ViewState;
            }

            return {
              loading: false,
              ok: false,
              pending: false,
              notFound: false,
              title: 'Payment status updated',
              message: `Current payment status: ${res?.status || 'unknown'}.`,
              amountLabel: amount,
              courseId: res?.courseId ?? null,
              courseTitle: res?.courseTitle ?? null,
            } as ViewState;
          }),
          startWith({
            loading: true,
            ok: false,
            pending: false,
            notFound: false,
            title: 'Checking payment',
            message: 'Please wait while we confirm your checkout.',
            amountLabel: null,
            courseId: null,
            courseTitle: null,
          } as ViewState),
          catchError((err) => {
            const notFound = err?.status === 404;
            return of<ViewState>({
              loading: false,
              ok: false,
              pending: false,
              notFound,
              title: notFound ? 'Session not found' : 'Unable to verify payment',
              message: notFound
                ? 'We could not find this checkout session.'
                : (typeof err?.error === 'string'
                    ? err.error
                    : 'Something went wrong while checking your payment status.'),
              amountLabel: null,
              courseId: null,
              courseTitle: null,
            });
          })
        );
      })
    );
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  goMyLearning() {
    this.router.navigateByUrl('/my-learning');
  }

  goCourse(courseId?: string | null) {
    if (!courseId) {
      this.router.navigateByUrl('/academies');
      return;
    }

    this.router.navigateByUrl(`/course/${courseId}`);
  }
}