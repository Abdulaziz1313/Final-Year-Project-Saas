import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { OrgApi } from '../../../core/services/org-api';
import { ToastService } from '../../../shared/ui/toast.service';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './join-org.html',
  styleUrl: './join-org.scss',
})
export class JoinOrgPage {
  inviteCode = '';
  loading = false;
  error: string | null = null;
  disabledOrg = false;

  constructor(
    private orgApi: OrgApi,
    private router: Router,
    private route: ActivatedRoute,
    private toast: ToastService
  ) {
    this.disabledOrg = this.route.snapshot.queryParamMap.get('disabled') === '1';
  }

  async submit() {
    this.error = null;

    const code = (this.inviteCode ?? '').trim();
    if (!code) {
      this.error = 'Invite code is required.';
      return;
    }

    this.loading = true;
    try {
      await firstValueFrom(this.orgApi.joinOrg(code));
      this.toast.success('Joined organization');
      // send instructor to instructor dashboard (or /academies-manage)
      await this.router.navigateByUrl('/instructor');
    } catch (e: any) {
      this.error =
        e?.error?.message ||
        (typeof e?.error === 'string' ? e.error : null) ||
        'Failed to join organization.';
    } finally {
      this.loading = false;
    }
  }
}