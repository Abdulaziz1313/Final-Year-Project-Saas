// app.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { Subscription } from 'rxjs';
import { LanguageService } from './core/services/language-services';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet],
  template: `<router-outlet />`,
})
export class AppComponent implements OnInit, OnDestroy {
  private sub = new Subscription();

  constructor(private langService: LanguageService) {
    // Re-apply saved language immediately on every bootstrap —
    // this covers page refresh, direct URL navigation, and tab restore.
    // The service constructor also calls _applyToDocument, so this is a
    // no-op on first load but ensures the class/dir are always correct.
    this.langService.set(this.langService.current);
  }

  ngOnInit(): void {
    // Keep body class and dir in sync if language is changed elsewhere
    // (e.g. another tab — storage event isn't strictly needed here since
    //  LanguageService is a singleton, but good practice for the future)
    this.sub.add(
      this.langService.lang$.subscribe(() => {
        // LanguageService._applyToDocument is called inside .set()
        // so nothing extra needed here — just keeping the subscription
        // alive so future cross-tab sync can be added.
      })
    );
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }
}