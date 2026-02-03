import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type ToastType = 'success' | 'error' | 'info';

export type ToastItem = {
  id: string;
  type: ToastType;
  message: string;
};

@Injectable({ providedIn: 'root' })
export class ToastService {
  private itemsSubject = new BehaviorSubject<ToastItem[]>([]);
  items$ = this.itemsSubject.asObservable();

  show(type: ToastType, message: string, ms = 3000) {
    const id = crypto.randomUUID();
    const next = [...this.itemsSubject.value, { id, type, message }];
    this.itemsSubject.next(next);

    setTimeout(() => this.remove(id), ms);
  }

  success(message: string, ms = 3000) { this.show('success', message, ms); }
  error(message: string, ms = 4000) { this.show('error', message, ms); }
  info(message: string, ms = 3000) { this.show('info', message, ms); }

  remove(id: string) {
    this.itemsSubject.next(this.itemsSubject.value.filter(t => t.id !== id));
  }

  clear() {
    this.itemsSubject.next([]);
  }
}
