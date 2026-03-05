import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { OrgApi, OrgMemberItem } from '../../../core/services/org-api';
import { ToastService } from '../../../shared/ui/toast.service';

type CreateOrgRequest = {
  name: string;
  website?: string | null;
  description?: string | null;
  primaryColor?: string | null;
  logoUrl?: string | null;
};

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './org-members.html',
  styleUrl: './org-members.scss',
})
export class OrgMembersPage implements OnInit {
  q = '';
  loading = false;
  error: string | null = null;

  items: OrgMemberItem[] = [];
  inviteCode: string | null = null;

  setupMode = false;
  createLoading = false;
  createError: string | null = null;

  form: CreateOrgRequest = {
    name: '',
    website: '',
    description: '',
    primaryColor: '#7c3aed',
    logoUrl: '',
  };

  constructor(
    private orgApi: OrgApi,
    private toast: ToastService,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit() {
    const qpSetup = this.route.snapshot.queryParamMap.get('setup') === '1';
    await this.resolveOrgState(qpSetup);
    this.cdr.detectChanges(); // force initial render
  }

  private async resolveOrgState(preferSetup: boolean) {
    this.error = null;
    this.createError = null;
    this.cdr.markForCheck();

    try {
      const me = await firstValueFrom(this.orgApi.getMyOrg());
      const org = me?.organization ?? null;

      if (!org) {
        this.setupMode = true;
        this.cdr.detectChanges();
        return;
      }

      this.setupMode = false;

      // load both, then refresh UI once
      await Promise.all([this.load(), this.loadInvite()]);
      this.cdr.detectChanges();
    } catch (e: any) {
      this.error =
        e?.error?.message ||
        (typeof e?.error === 'string' ? e.error : null) ||
        'Failed to load organization.';
      this.cdr.detectChanges();
    }
  }

  async load() {
    this.loading = true;
    this.error = null;
    this.cdr.markForCheck();

    try {
      const res = await firstValueFrom(this.orgApi.listMembers(this.q, 'Instructor'));
      this.items = res?.items ?? [];
    } catch (e: any) {
      this.error =
        e?.error?.message ||
        (typeof e?.error === 'string' ? e.error : null) ||
        'Failed to load members.';
    } finally {
      this.loading = false;
      this.cdr.detectChanges(); // update list + button text immediately
    }
  }

  async loadInvite() {
    try {
      const res = await firstValueFrom(this.orgApi.getInviteCode());
      this.inviteCode = res?.inviteCode ?? null;
    } catch {
      this.inviteCode = null;
    } finally {
      this.cdr.detectChanges(); // show invite code immediately
    }
  }

  async copyInvite(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      this.toast.success('Invite code copied');
    } catch {
      this.toast.error('Could not copy invite code');
    }
  }

  async rotateInvite() {
    this.loading = true;
    this.cdr.markForCheck();

    try {
      const res = await firstValueFrom(this.orgApi.rotateInviteCode());
      this.inviteCode = res?.inviteCode ?? this.inviteCode;
      this.toast.success('Invite code rotated');
    } catch (e: any) {
      this.toast.error(
        e?.error?.message ||
          (typeof e?.error === 'string' ? e.error : null) ||
          'Failed to rotate invite code.'
      );
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  async createOrg() {
    this.createError = null;

    const name = (this.form.name ?? '').trim();
    if (!name) {
      this.createError = 'Organization name is required.';
      this.cdr.detectChanges();
      return;
    }

    const payload: CreateOrgRequest = {
      name,
      website: (this.form.website ?? '').trim() || null,
      description: (this.form.description ?? '').trim() || null,
      primaryColor: (this.form.primaryColor ?? '').trim() || null,
      logoUrl: (this.form.logoUrl ?? '').trim() || null,
    };

    this.createLoading = true;
    this.cdr.markForCheck();

    try {
      await firstValueFrom(this.orgApi.createOrg(payload as any));
      this.toast.success('Organization created');
      this.setupMode = false;

      await Promise.all([this.load(), this.loadInvite()]);
    } catch (e: any) {
      this.createError =
        e?.error?.message ||
        (typeof e?.error === 'string' ? e.error : null) ||
        'Failed to create organization.';
    } finally {
      this.createLoading = false;
      this.cdr.detectChanges();
    }
  }
}