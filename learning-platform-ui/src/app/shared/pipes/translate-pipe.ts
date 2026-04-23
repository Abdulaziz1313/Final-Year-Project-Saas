// shared/pipes/translate.pipe.ts
import { Pipe, PipeTransform, OnDestroy } from '@angular/core';
import { Subscription } from 'rxjs';
import { LanguageService } from '../../core/services/language-services';

/**
 * Usage in any template:
 *   {{ 'save' | translate }}
 *   {{ 'academies' | translate }}
 *
 * The pipe marks itself as impure so it re-evaluates whenever
 * the language changes — Angular's change detection picks it up
 * automatically because lang$ emits and triggers a re-render.
 */
@Pipe({
  name: 'translate',
  standalone: true,
  pure: false, // re-evaluates on every change detection cycle when lang changes
})
export class TranslatePipe implements PipeTransform, OnDestroy {
  private sub: Subscription;
  private currentLang: string;

  constructor(private lang: LanguageService) {
    this.currentLang = this.lang.current;

    // Subscribe so Angular's change detection is triggered when language changes
    this.sub = this.lang.lang$.subscribe((l) => {
      this.currentLang = l;
    });
  }

  transform(key: string): string {
    return this.lang.label(key);
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }
}