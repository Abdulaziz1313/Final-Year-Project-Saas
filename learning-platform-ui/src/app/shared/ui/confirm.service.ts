import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

export type ConfirmRequest = {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
};

type InternalReq = ConfirmRequest & { resolve: (v: boolean) => void };

@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private reqSubject = new Subject<InternalReq>();
  requests$ = this.reqSubject.asObservable();

  open(req: ConfirmRequest): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.reqSubject.next({ ...req, resolve });
    });
  }
}
