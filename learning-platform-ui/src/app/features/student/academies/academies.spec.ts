import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Academies } from './academies';

describe('Academies', () => {
  let component: Academies;
  let fixture: ComponentFixture<Academies>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Academies]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Academies);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
