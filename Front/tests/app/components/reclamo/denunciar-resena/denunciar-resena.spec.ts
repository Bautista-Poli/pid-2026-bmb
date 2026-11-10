import { TestBed } from '@angular/core/testing';
import { throwError } from 'rxjs';
import { CalificacionService } from '@app/services/calificacion.service';
import { DenunciarResena } from '@app/components/reclamo/denunciar-resena/denunciar-resena';

// jsdom no implementa <dialog>.showModal()/close(), que usa ui-modal al abrirse.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.open = false;
  };
});

describe('DenunciarResena', () => {
  it('si la denuncia falla, muestra el error y avisa para recargar la lista', async () => {
    await TestBed.configureTestingModule({
      imports: [DenunciarResena],
      providers: [
        {
          provide: CalificacionService,
          useValue: { denunciar: () => throwError(() => new Error('Esta reseña ya fue denunciada')) },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(DenunciarResena);
    fixture.componentRef.setInput('calificacionId', 'q1');
    let fallos = 0;
    fixture.componentInstance.fallo.subscribe(() => (fallos += 1));
    fixture.detectChanges();
    await fixture.whenStable();

    const raiz = fixture.nativeElement as HTMLElement;
    raiz.querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    expect(raiz.textContent).toContain('Esta reseña ya fue denunciada');
    expect(fallos).toBe(1);
  });
});
