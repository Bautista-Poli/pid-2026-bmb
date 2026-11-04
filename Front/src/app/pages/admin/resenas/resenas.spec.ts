import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ResenaDenunciada } from '@app/models';
import { EstadoDenunciaResena } from '@app/models';
import { AdminService } from '@app/services/admin.service';
import { Resenas } from './resenas';

const PENDIENTE: ResenaDenunciada = {
  id: 'q1',
  autor: 'CONDUCTOR',
  nota: 1.4,
  etiquetas: [],
  comentario: 'Un desastre',
  creadaEn: '2026-11-01T12:00:00Z',
  estacionamiento: { id: 'e1', nombre: 'Centro' },
  conductor: { id: 'c1', nombre: 'Ana Paz' },
  motivo: 'FALSA',
  detalle: null,
  denunciadaEn: '2026-11-02T12:00:00Z',
  estado: 'PENDIENTE',
  moderadaEn: null,
};

describe('Resenas (admin)', () => {
  it('si moderar falla (otro admin ya la resolvio), muestra el error y recarga la cola', async () => {
    let pedidos = 0;
    await TestBed.configureTestingModule({
      imports: [Resenas],
      providers: [
        provideRouter([]),
        {
          provide: AdminService,
          useValue: {
            resenas: () => {
              pedidos += 1;
              return of([PENDIENTE]);
            },
            desestimarResena: () => throwError(() => new Error('Esta denuncia ya fue resuelta')),
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(Resenas);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(pedidos).toBe(1);

    const raiz = fixture.nativeElement as HTMLElement;
    const desestimar = [...raiz.querySelectorAll('button')].find((b) => b.textContent?.includes('Desestimar'));
    desestimar!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(raiz.textContent).toContain('Esta denuncia ya fue resuelta');
    expect(pedidos).toBe(2);
  });
});

describe('Resenas (admin): filtro y historial', () => {
  async function render(estadoEnUrl: string, lista: ResenaDenunciada[]) {
    const pedidos: EstadoDenunciaResena[] = [];
    await TestBed.configureTestingModule({
      imports: [Resenas],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap({ estado: estadoEnUrl })) } },
        {
          provide: AdminService,
          useValue: {
            resenas: (estado: EstadoDenunciaResena) => {
              pedidos.push(estado);
              return of(lista);
            },
          },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(Resenas);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { raiz: fixture.nativeElement as HTMLElement, pedidos };
  }

  it('un estado invalido en la URL cae en Pendientes', async () => {
    const { pedidos } = await render('XYZ', []);
    expect(pedidos).toEqual(['PENDIENTE']);
  });

  it('en el historial muestra cuando se modero', async () => {
    const desestimada = { ...PENDIENTE, estado: 'DESESTIMADA' as const, moderadaEn: '2026-11-03T15:30:00Z' };
    const { raiz } = await render('DESESTIMADA', [desestimada]);
    expect(raiz.textContent).toContain('Moderada');
  });
});
