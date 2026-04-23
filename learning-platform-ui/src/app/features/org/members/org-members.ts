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

type AcademyLite = { id: string; name: string; slug?: string };

type CreateInstructorPayload = {
  academyId: string;
  email: string;
  tempPassword: string;
  displayName?: string | null;
  sendEmail: boolean;
};

type PasswordChecks = {
  length: boolean;
  upper: boolean;
  lower: boolean;
  digit: boolean;
  special: boolean;
};

type MemberView = OrgMemberItem & {
  academyId?: string | null;
  academyName?: string | null;
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

  items: MemberView[] = [];
  inviteCode: string | null = null;

  setupMode = false;
  createLoading = false;
  createError: string | null = null;

  createInstructorOpen = false;
  createInstructorLoading = false;
  createInstructorError: string | null = null;

  academies: AcademyLite[] = [];

  ci: CreateInstructorPayload = {
    academyId: '',
    email: '',
    tempPassword: '',
    displayName: '',
    sendEmail: false,
  };

  lastCreatedCreds: string | null = null;

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
    this.cdr.detectChanges();
  }

  get passwordChecks(): PasswordChecks {
    return this.getPasswordChecks(this.ci.tempPassword);
  }

  get isTempPasswordValid(): boolean {
    return this.validatePassword(this.ci.tempPassword);
  }

  private getPasswordChecks(password: string | null | undefined): PasswordChecks {
    const value = (password ?? '').trim();

    return {
      length: value.length >= 8,
      upper: /[A-Z]/.test(value),
      lower: /[a-z]/.test(value),
      digit: /\d/.test(value),
      special: /[^A-Za-z0-9]/.test(value),
    };
  }

  private validatePassword(password: string | null | undefined): boolean {
    const checks = this.getPasswordChecks(password);
    return checks.length && checks.upper && checks.lower && checks.digit && checks.special;
  }

  private async resolveOrgState(_preferSetup: boolean) {
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

      await Promise.all([this.load(), this.loadInvite(), this.loadAcademies()]);
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
      const raw: any[] = res?.items ?? [];

      this.items = raw.map((u: any) => {
        const academyId = u.academyId ?? null;
        const mappedAcademyName =
          u.academyName ??
          this.academies.find(a => a.id === academyId)?.name ??
          null;

        return {
          ...u,
          academyId,
          academyName: mappedAcademyName,
        };
      });
    } catch (e: any) {
      this.error =
        e?.error?.message ||
        (typeof e?.error === 'string' ? e.error : null) ||
        'Failed to load members.';
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  async loadInvite() {
    try {
      const res = await firstValueFrom(this.orgApi.getInviteCode());
      this.inviteCode = res?.inviteCode ?? null;
    } catch {
      this.inviteCode = null;
    } finally {
      this.cdr.detectChanges();
    }
  }

  async loadAcademies() {
    try {
      const api: any = this.orgApi as any;
      if (!api.listAcademies) {
        this.academies = [];
        return;
      }

      const res = await firstValueFrom(api.listAcademies());
      const items = Array.isArray(res) ? res : [];

      this.academies = items.map((a: any) => ({
        id: a.id,
        name: a.name,
        slug: a.slug,
      }));

      if (!this.ci.academyId && this.academies.length > 0) {
        this.ci.academyId = this.academies[0].id;
      }
    } catch {
      this.academies = [];
    } finally {
      this.cdr.detectChanges();
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

      await Promise.all([this.load(), this.loadInvite(), this.loadAcademies()]);
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

  async openCreateInstructor() {
    this.createInstructorError = null;
    this.lastCreatedCreds = null;

    if (this.academies.length === 0) await this.loadAcademies();

    this.ci = {
      academyId: this.academies[0]?.id ?? '',
      email: '',
      tempPassword: this.generatePasswordValue(),
      displayName: '',
      sendEmail: false,
    };

    this.createInstructorOpen = true;
    this.cdr.detectChanges();
  }

  closeCreateInstructor() {
    if (this.createInstructorLoading) return;
    this.createInstructorOpen = false;
    this.createInstructorError = null;
    this.lastCreatedCreds = null;
    this.cdr.detectChanges();
  }

  generateTempPassword() {
    this.ci.tempPassword = this.generatePasswordValue();
    this.cdr.detectChanges();
  }

  private randomChar(source: string): string {
    return source[Math.floor(Math.random() * source.length)];
  }

  private shuffleString(value: string): string {
    const arr = value.split('');
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.join('');
  }

  private generatePasswordValue(): string {
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lower = 'abcdefghijkmnopqrstuvwxyz';
    const digits = '23456789';
    const special = '!@#$%^&*?_+-=';
    const all = upper + lower + digits + special;

    let password = '';
    password += this.randomChar(upper);
    password += this.randomChar(lower);
    password += this.randomChar(digits);
    password += this.randomChar(special);

    const len = 14;
    while (password.length < len) {
      password += this.randomChar(all);
    }

    password = this.shuffleString(password);

    if (!this.validatePassword(password)) {
      return this.generatePasswordValue();
    }

    return password;
  }

  async createInstructor() {
    this.createInstructorError = null;
    this.lastCreatedCreds = null;

    const academyId = (this.ci.academyId ?? '').trim();
    const email = (this.ci.email ?? '').trim().toLowerCase();
    const tempPassword = (this.ci.tempPassword ?? '').trim();
    const displayName = (this.ci.displayName ?? '').trim();
    const sendEmail = !!this.ci.sendEmail;

    if (!academyId) {
      this.createInstructorError = 'Please select an academy.';
      this.cdr.detectChanges();
      return;
    }

    if (!email || !email.includes('@')) {
      this.createInstructorError = 'Please enter a valid email.';
      this.cdr.detectChanges();
      return;
    }

    if (!this.validatePassword(tempPassword)) {
      this.createInstructorError =
        'Temporary password must be at least 8 characters and include uppercase, lowercase, number, and special character.';
      this.cdr.detectChanges();
      return;
    }

    this.createInstructorLoading = true;
    this.cdr.markForCheck();

    try {
      const payload = {
        academyId,
        email,
        tempPassword,
        displayName: displayName || null,
        sendEmail,
      };

      const api: any = this.orgApi as any;
      if (!api.createInstructor) {
        throw new Error('OrgApi missing createInstructor(). Add POST /api/orgs/instructors in OrgApi.');
      }

      await firstValueFrom(api.createInstructor(payload));

      const academyName = this.academies.find(a => a.id === academyId)?.name ?? 'Academy';
      const creds = `Instructor account created
Academy: ${academyName}
Email: ${email}
Temp password: ${tempPassword}
First login: must change password`;
      this.lastCreatedCreds = creds;

      try {
        await navigator.clipboard.writeText(creds);
        this.toast.success(sendEmail ? 'Instructor created + email sent' : 'Instructor created (credentials copied)');
      } catch {
        this.toast.success('Instructor created');
      }

      this.createInstructorOpen = false;
      await this.load();
    } catch (e: any) {
      const msg =
        e?.error?.message ||
        (typeof e?.error === 'string' ? e.error : null) ||
        e?.message ||
        'Failed to create instructor.';
      this.createInstructorError = msg;
    } finally {
      this.createInstructorLoading = false;
      this.cdr.detectChanges();
    }
  }
}