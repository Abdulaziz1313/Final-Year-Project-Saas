import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AcademyCreate } from './academy-create';

describe('AcademyCreate', () => {
  let component: AcademyCreate;
  let fixture: ComponentFixture<AcademyCreate>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AcademyCreate]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AcademyCreate);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
