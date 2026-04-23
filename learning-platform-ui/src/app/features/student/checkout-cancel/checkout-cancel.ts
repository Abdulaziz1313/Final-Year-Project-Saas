import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';

@Component({
  selector: 'app-checkout-cancel',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './checkout-cancel.html',
  styleUrl: './checkout-cancel.scss',
})
export class CheckoutCancelComponent {
  courseId = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router
  ) {
    this.courseId = this.route.snapshot.queryParamMap.get('courseId') || '';
  }

  goBackToCourse() {
    if (!this.courseId) {
      this.router.navigateByUrl('/academies');
      return;
    }

    this.router.navigateByUrl(`/course/${this.courseId}`);
  }

  goAcademies() {
    this.router.navigateByUrl('/academies');
  }
}