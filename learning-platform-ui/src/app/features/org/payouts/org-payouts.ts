import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { BehaviorSubject, Observable, forkJoin, of } from 'rxjs';
import { catchError, map, startWith, switchMap } from 'rxjs/operators';
import {
  OrgApi,
  OrgEarningsSummaryResponse,
  OrgInstructorBalanceItem,
  OrgPayoutRequestItem,
  AcademySummary
} from '../../../core/services/org-api';

type LoadState<T> = {
  loading: boolean;
  data: T | null;
  error: string | null;
};

type InstructorRow = {
  instructorUserId: string;
  instructor: {
    id?: string | null;
    email?: string | null;
    displayName?: string | null;
    profileImageUrl?: string | null;
  };
  availableNow: number;
  processing: number;
  paidOut: number;
  lifetimeEarned: number;
  academies: Array<{
    academyId: string;
    academyName: string;
    availableNow: number;
    processing: number;
    paidOut: number;
    lifetimeEarned: number;
  }>;
};

type InstructorRequestRow = OrgPayoutRequestItem & {
  academyId: string;
  academyName: string;
};

type OrgPayoutsVm = {
  summary: {
    totalGross: number;
    totalPlatform: number;
    totalOrganization: number;
    totalInstructor: number;
    unpaidInstructor: number;
    pendingRequests: number;
  };
  instructors: InstructorRow[];
  requests: InstructorRequestRow[];
  academies: AcademySummary[];
};

@Component({
  selector: 'app-org-payouts',
  standalone: true,
  imports: [CommonModule, RouterModule, ReactiveFormsModule],
  templateUrl: './org-payouts.html',
  styleUrl: './org-payouts.scss',
})
export class OrgPayoutsComponent {
  academyId = '';
  selectedInstructorUserId = '';
  private reload$ = new BehaviorSubject<void>(undefined);

  releasing = false;
  releaseMessage: string | null = null;
  releaseError: string | null = null;

  markingId: string | null = null;
  markMessage: string | null = null;
  markError: string | null = null;

  form: FormGroup;

  state$: Observable<LoadState<OrgPayoutsVm>> = this.reload$.pipe(
    switchMap(() =>
      this.api.listAcademies().pipe(
        switchMap((academies) => {
          if (!academies || academies.length === 0) {
            return of({
              loading: false,
              data: {
                summary: {
                  totalGross: 0,
                  totalPlatform: 0,
                  totalOrganization: 0,
                  totalInstructor: 0,
                  unpaidInstructor: 0,
                  pendingRequests: 0
                },
                instructors: [],
                requests: [],
                academies: []
              },
              error: null
            } as LoadState<OrgPayoutsVm>);
          }

          const academyCalls = academies.map((academy) =>
            forkJoin({
              summary: this.api.getAcademyEarningsSummary(academy.id),
              balances: this.api.getInstructorBalances(academy.id),
              requests: this.api.getPayoutRequests(academy.id)
            }).pipe(
              map((res) => ({
                academy,
                summary: res.summary,
                balances: res.balances,
                requests: res.requests
              }))
            )
          );

          return forkJoin(academyCalls).pipe(
            map((results) => {
              const summary = {
                totalGross: results.reduce((sum, x) => sum + (x.summary.totalGross || 0), 0),
                totalPlatform: results.reduce((sum, x) => sum + (x.summary.totalPlatform || 0), 0),
                totalOrganization: results.reduce((sum, x) => sum + (x.summary.totalOrganization || 0), 0),
                totalInstructor: results.reduce((sum, x) => sum + (x.summary.totalInstructor || 0), 0),
                unpaidInstructor: results.reduce((sum, x) => sum + (x.summary.unpaidInstructor || 0), 0),
                pendingRequests: results.reduce((sum, x) => sum + (x.summary.pendingRequests || 0), 0)
              };

              const instructorMap = new Map<string, InstructorRow>();

              for (const result of results) {
                for (const item of result.balances) {
                  const key = item.instructorUserId;
                  const existing = instructorMap.get(key);

                  if (!existing) {
                    instructorMap.set(key, {
                      instructorUserId: item.instructorUserId,
                      instructor: item.instructor,
                      availableNow: item.availableNow || 0,
                      processing: item.processing || 0,
                      paidOut: item.paidOut || 0,
                      lifetimeEarned: item.lifetimeEarned || 0,
                      academies: [
                        {
                          academyId: result.academy.id,
                          academyName: result.academy.name,
                          availableNow: item.availableNow || 0,
                          processing: item.processing || 0,
                          paidOut: item.paidOut || 0,
                          lifetimeEarned: item.lifetimeEarned || 0
                        }
                      ]
                    });
                  } else {
                    existing.availableNow += item.availableNow || 0;
                    existing.processing += item.processing || 0;
                    existing.paidOut += item.paidOut || 0;
                    existing.lifetimeEarned += item.lifetimeEarned || 0;
                    existing.academies.push({
                      academyId: result.academy.id,
                      academyName: result.academy.name,
                      availableNow: item.availableNow || 0,
                      processing: item.processing || 0,
                      paidOut: item.paidOut || 0,
                      lifetimeEarned: item.lifetimeEarned || 0
                    });
                  }
                }
              }

              const instructors = Array.from(instructorMap.values())
                .sort((a, b) => (b.availableNow + b.processing + b.lifetimeEarned) - (a.availableNow + a.processing + a.lifetimeEarned));

              const requests: InstructorRequestRow[] = results
                .flatMap((result) =>
                  result.requests.map((r) => ({
                    ...r,
                    academyId: result.academy.id,
                    academyName: result.academy.name
                  }))
                )
                .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

              if (!this.selectedInstructorUserId && instructors.length > 0) {
                this.selectedInstructorUserId = instructors[0].instructorUserId;
              }

              const filteredRequests = this.selectedInstructorUserId
                ? requests.filter((x) => x.instructorUserId === this.selectedInstructorUserId)
                : requests;

              return {
                loading: false,
                data: {
                  summary,
                  instructors,
                  requests: filteredRequests,
                  academies
                },
                error: null
              } as LoadState<OrgPayoutsVm>;
            }),
            startWith({ loading: true, data: null, error: null } as LoadState<OrgPayoutsVm>),
            catchError((err) =>
              of({
                loading: false,
                data: null,
                error: typeof err?.error === 'string' ? err.error : 'Failed to load payouts.',
              } as LoadState<OrgPayoutsVm>)
            )
          );
        }),
        catchError((err) =>
          of({
            loading: false,
            data: null,
            error: typeof err?.error === 'string' ? err.error : 'Failed to load academies.',
          } as LoadState<OrgPayoutsVm>)
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
      note: ['']
    });
  }

  reload() {
    this.reload$.next();
  }

  selectInstructor(instructorUserId: string) {
    this.selectedInstructorUserId = instructorUserId;
    this.reload();
  }

  releaseWeekly() {
    this.releaseMessage = null;
    this.releaseError = null;

    if (this.releasing) return;

    this.releasing = true;

    this.api.listAcademies().subscribe({
      next: (academies) => {
        if (!academies.length) {
          this.releasing = false;
          this.releaseError = 'No academies found.';
          return;
        }

        forkJoin(
          academies.map((a) => this.api.releaseWeeklyPayouts(a.id))
        ).subscribe({
          next: (results) => {
            const totalCreated = results.reduce((sum, x) => sum + (x.createdCount || 0), 0);
            this.releasing = false;
            this.releaseMessage = `Created ${totalCreated} payout batch${totalCreated === 1 ? '' : 'es'}.`;
            this.releaseError = null;
            this.reload();
          },
          error: (err) => {
            this.releasing = false;
            this.releaseMessage = null;
            this.releaseError = typeof err?.error === 'string' ? err.error : 'Failed to release payouts.';
          }
        });
      },
      error: (err) => {
        this.releasing = false;
        this.releaseMessage = null;
        this.releaseError = typeof err?.error === 'string' ? err.error : 'Failed to load academies.';
      }
    });
  }

  markPaid(payoutId?: string | null) {
    if (!payoutId || this.markingId) return;

    this.markingId = payoutId;
    this.markMessage = null;
    this.markError = null;

    const note = (this.form.value.note || '').trim();

    this.api.markPayoutPaid(payoutId, note || null).subscribe({
      next: () => {
        this.markMessage = 'Payout marked as paid.';
        this.markError = null;
        this.markingId = null;
        this.reload();
      },
      error: (err) => {
        this.markMessage = null;
        this.markError = typeof err?.error === 'string' ? err.error : 'Failed to mark payout as paid.';
        this.markingId = null;
      }
    });
  }

  openSettings() {
    if (this.academyId) {
      this.router.navigateByUrl(`/org/payout-settings/${this.academyId}`);
      return;
    }

    this.api.listAcademies().subscribe({
      next: (academies) => {
        const firstAcademyId = academies?.[0]?.id;
        if (firstAcademyId) {
          this.router.navigateByUrl(`/org/payout-settings/${firstAcademyId}`);
        }
      }
    });
  }

  selectedInstructor(vm: OrgPayoutsVm): InstructorRow | null {
    if (!this.selectedInstructorUserId) return vm.instructors[0] || null;
    return vm.instructors.find(x => x.instructorUserId === this.selectedInstructorUserId) || null;
  }

  money(amount: number, currency = 'EUR'): string {
  const value = Number(amount || 0);
  return `${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })} ${currency}`;
}

  when(value?: string | null): string {
    if (!value) return '—';
    const t = Date.parse(value);
    return Number.isFinite(t) ? new Date(t).toLocaleString() : value;
  }

  requestStatusClass(status: string): string {
    switch ((status || '').toLowerCase()) {
      case 'requested': return 'status-requested';
      case 'approved': return 'status-approved';
      case 'processing': return 'status-processing';
      case 'paid': return 'status-paid';
      default: return '';
    }
  }
}