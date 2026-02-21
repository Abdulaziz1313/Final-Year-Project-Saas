import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CourseCreateComponent } from './course-create';

describe('CourseCreate', () => {
  let component: CourseCreateComponent;
  let fixture: ComponentFixture<CourseCreateComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CourseCreateComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CourseCreateComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
