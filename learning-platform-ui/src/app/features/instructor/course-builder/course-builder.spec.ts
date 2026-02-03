import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CourseBuilderComponent} from './course-builder';

describe('CourseBuilder', () => {
  let component: CourseBuilderComponent;
  let fixture: ComponentFixture<CourseBuilderComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CourseBuilderComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CourseBuilderComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
