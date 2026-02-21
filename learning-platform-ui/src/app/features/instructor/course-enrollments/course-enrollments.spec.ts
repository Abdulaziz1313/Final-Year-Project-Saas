import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CourseEnrollmentsComponent } from './course-enrollments';

describe('CourseEnrollments', () => {
  let component: CourseEnrollmentsComponent;
  let fixture: ComponentFixture<CourseEnrollmentsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CourseEnrollmentsComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CourseEnrollmentsComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
