import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { CalificacionService } from '@app/services/calificacion.service';
import { Calificar } from './calificar';

describe('Calificar', () => {
  beforeAll(() => {
    const proto = HTMLDialogElement.prototype as unknown as Record<string, unknown>;
    if (typeof proto['showModal'] === 'function') return;
    proto['showModal'] = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    proto['close'] = function (this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  });

  async function montar() {
    const calificar = vi.fn(() => of(undefined));
    await TestBed.configureTestingModule({
      imports: [Calificar],
      providers: [{ provide: CalificacionService, useValue: { calificar } }],
    }).compileComponents();
    const fixture = TestBed.createComponent(Calificar);
    fixture.componentRef.setInput('titulo', 'Calificá el estacionamiento');
    fixture.componentRef.setInput('objeto', { idReserva: 'r1', descripcion: 'Centro · 18 oct' });
    fixture.detectChanges();
    const raiz = fixture.nativeElement as HTMLElement;
    const enviar = () => raiz.querySelector('button[type="submit"]') as HTMLButtonElement;
    const estrella = (n: number) => raiz.querySelector(`[aria-label="${n} estrellas"]`) as HTMLButtonElement;
    return { fixture, calificar, enviar, estrella };
  }

  it('sin puntaje no se puede enviar', async () => {
    const { enviar } = await montar();
    expect(enviar().disabled).toBe(true);
  });

  it('con puntaje envia y avisa', async () => {
    const { fixture, calificar, enviar, estrella } = await montar();
    const avisos: unknown[] = [];
    fixture.componentInstance.calificado.subscribe(() => avisos.push(true));

    estrella(4).click();
    fixture.detectChanges();
    expect(enviar().disabled).toBe(false);
    enviar().click();
    fixture.detectChanges();

    expect(calificar).toHaveBeenCalledWith('r1', { puntaje: 4, comentario: '' });
    expect(avisos.length).toBe(1);
  });
});
