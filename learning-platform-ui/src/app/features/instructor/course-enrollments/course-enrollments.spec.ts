import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CourseEnrollments } from './course-enrollments';

describe('CourseEnrollments', () => {
  let component: CourseEnrollments;
  let fixture: ComponentFixture<CourseEnrollments>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CourseEnrollments]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CourseEnrollments);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
