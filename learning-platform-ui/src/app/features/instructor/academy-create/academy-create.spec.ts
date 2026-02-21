import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AcademyCreateComponent } from './academy-create';

describe('AcademyCreate', () => {
  let component: AcademyCreateComponent;
  let fixture: ComponentFixture<AcademyCreateComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AcademyCreateComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AcademyCreateComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
