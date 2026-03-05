import { Component } from "@angular/core";
import { Router } from "@angular/router";
import { FormsModule } from "@angular/forms";
import { CommonModule } from "@angular/common";
import { OrgApi } from "../../../core/services/org-api";

type StepKey = "details" | "branding" | "review";

@Component({
  selector: "app-org-academy-create",
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: "./org-academy-create.html",
  styleUrl: "./org-academy-create.scss",
})
export class OrgAcademyCreateComponent {
  name         = "";
  description  = "";
  website      = "";
  primaryColor = "#7c3aed";
  fontKey      = "system";
  loading      = false;
  error        = "";
  created: any = null;
  copied       = false;

  step: StepKey = "details";

  constructor(private orgApi: OrgApi, private router: Router) {}

  // ── Stepper ──────────────────────────────────
  goStep(s: StepKey) {
    this.step = s;
    queueMicrotask(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  }

  prevStep() {
    const order: StepKey[] = ["details", "branding", "review"];
    const i = order.indexOf(this.step);
    this.step = order[Math.max(0, i - 1)];
    queueMicrotask(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  }

  nextStep() {
    const order: StepKey[] = ["details", "branding", "review"];
    const i = order.indexOf(this.step);
    this.step = order[Math.min(order.length - 1, i + 1)];
    queueMicrotask(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  }

  isStepDone(s: StepKey): boolean {
    if (s === "details") {
      return this.step === "branding" || this.step === "review";
    }
    if (s === "branding") {
      return this.step === "review";
    }
    return false;
  }

  // ── Submit ────────────────────────────────────
  submit() {
    this.error = "";
    if (!this.name.trim()) { this.error = "Name is required."; return; }

    this.loading = true;
    this.orgApi.createAcademy({
      name:         this.name,
      description:  this.description,
      website:      this.website,
      primaryColor: this.primaryColor,
      fontKey:      this.fontKey,
    }).subscribe({
      next:  (res) => { this.loading = false; this.created = res; },
      error: (err) => { this.loading = false; this.error = err?.error ?? "Failed to create academy."; },
    });
  }

  // ── Instructor link ───────────────────────────
  get instructorLink(): string {
    return this.created
      ? window.location.origin + "/auth/register/instructor?academy=" + this.created.slug
      : "";
  }

  copyLink() {
    navigator.clipboard.writeText(this.instructorLink);
    this.copied = true;
    setTimeout(() => (this.copied = false), 2000);
  }

  done() {
    this.router.navigateByUrl("/org/academies");
  }
}