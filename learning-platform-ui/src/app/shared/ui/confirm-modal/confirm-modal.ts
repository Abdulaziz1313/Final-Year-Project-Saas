import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConfirmService } from '../confirm.service';

@Component({
  selector: 'app-confirm-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './confirm-modal.html',
  styleUrl: './confirm-modal.scss',
})
export class ConfirmModalComponent {
  open = false;
  title = '';
  message = '';
  confirmText = 'Confirm';
  cancelText = 'Cancel';

  private resolveFn: ((v: boolean) => void) | null = null;

  constructor(private confirm: ConfirmService) {
    this.confirm.requests$.subscribe(req => {
      this.open = true;
      this.title = req.title;
      this.message = req.message;
      this.confirmText = req.confirmText ?? 'Confirm';
      this.cancelText = req.cancelText ?? 'Cancel';
      this.resolveFn = req.resolve;
    });
  }

  close(result: boolean) {
    this.open = false;
    this.resolveFn?.(result);
    this.resolveFn = null;
  }
}
