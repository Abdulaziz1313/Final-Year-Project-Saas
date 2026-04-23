import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface AcademyBrandSignal {
  slug: string;
  name: string;
  orgName?: string | null;
  logoUrl?: string | null;
  primaryColor?: string | null;
}

/**
 * Shared singleton service that lets any component (e.g. CoursePublicComponent)
 * broadcast the current academy brand to the PublicLayoutComponent topbar.
 *
 * Usage — in any component that knows the academy:
 *   this.academyBrandService.set({ slug, name, logoUrl, primaryColor });
 *
 * Clear when navigating away or on destroy:
 *   this.academyBrandService.clear();
 */
@Injectable({ providedIn: 'root' })
export class AcademyBrandService {
  private _brand$ = new BehaviorSubject<AcademyBrandSignal | null>(null);
  readonly brand$ = this._brand$.asObservable();

  set(brand: AcademyBrandSignal): void {
    this._brand$.next(brand);
  }

  clear(): void {
    this._brand$.next(null);
  }

  get current(): AcademyBrandSignal | null {
    return this._brand$.value;
  }
}