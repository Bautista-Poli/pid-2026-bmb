import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { throwError } from 'rxjs';
import { Usuario } from '@app/models';
import { AuthService } from '@app/services/auth.service';
import { CalificacionService } from '@app/services/calificacion.service';
import { Perfil } from './perfil';

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
