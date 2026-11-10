import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ReputacionConductor, Usuario } from '@app/models';
import { AuthService } from '@app/services/auth.service';
import { CalificacionService } from '@app/services/calificacion.service';
import { Perfil } from '@app/pages/perfil/perfil';

const CONDUCTOR: Usuario = {
  id: 'u1',
  nombre: 'Ana',
  apellido: 'Paz',
  email: 'ana@parkit.test',
  telefono: null,
  rol: 'CONDUCTOR',
  roles: ['CONDUCTOR'],
  fechaAlta: '2026-11-01T12:00:00Z',
  activo: true,
};

describe('Perfil: Tu reputación', () => {
  it('si falla la reputación, el perfil se sigue viendo con un aviso', async () => {
    await TestBed.configureTestingModule({
      imports: [Perfil],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { usuario: signal(CONDUCTOR) } },
        {
          provide: CalificacionService,
          useValue: { miReputacion: () => throwError(() => new Error('No pudimos conectarnos con el servidor')) },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(Perfil);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Tus datos');
    expect(texto).toContain('No pudimos cargar tu reputación');
  });
});

describe('Perfil: Reseñas que recibiste', () => {
  async function render(reputacion: ReputacionConductor): Promise<HTMLElement> {
    await TestBed.configureTestingModule({
      imports: [Perfil],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { usuario: signal(CONDUCTOR) } },
        { provide: CalificacionService, useValue: { miReputacion: () => of(reputacion) } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(Perfil);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const botones = (raiz: HTMLElement) => [...raiz.querySelectorAll('button')].map((b) => b.textContent?.trim());

  const resena = {
    id: 'q1',
    puntaje: 4,
    etiquetas: ['PUNTUAL' as const],
    comentario: 'Llegó a horario',
    creadaEn: '2026-11-01T12:00:00Z',
    estacionamiento: 'Centro',
    denunciaEstado: null,
  };

  it('lista las reseñas que recibiste con su boton Denunciar', async () => {
    const raiz = await render({ promedio: 4, cantidad: 1, etiquetas: [], resenas: [resena] });
    const texto = raiz.textContent ?? '';
    expect(texto).toContain('Reseñas que recibiste');
    expect(texto).toContain('Llegó a horario');
    expect(texto).toContain('Centro');
    expect(botones(raiz)).toContain('Denunciar');
  });

  it('una ya denunciada muestra el estado y no el boton', async () => {
    const raiz = await render({
      promedio: 4,
      cantidad: 1,
      etiquetas: [],
      resenas: [{ ...resena, denunciaEstado: 'PENDIENTE' }],
    });
    expect(raiz.textContent).toContain('Denunciada');
    expect(botones(raiz)).not.toContain('Denunciar');
  });
});
