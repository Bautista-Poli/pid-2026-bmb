import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { Boton, Cargando, Chip, EstadoVacio, Modal, Tarjeta } from '@app/components/ui';
import {
  EstadoDenunciaResena,
  ResenaDenunciada,
  TEXTO_ETIQUETA,
  TEXTO_ETIQUETA_CONDUCTOR,
  TEXTO_MOTIVO_DENUNCIA,
  formatearNota,
} from '@app/models';
import { AdminService } from '@app/services/admin/admin.service';

const FILTROS: { estado: EstadoDenunciaResena; etiqueta: string; vacio: string }[] = [
  { estado: 'PENDIENTE', etiqueta: 'Pendientes', vacio: 'No hay reseñas denunciadas' },
  { estado: 'DESESTIMADA', etiqueta: 'Desestimadas', vacio: 'Todavía no hay denuncias desestimadas' },
  { estado: 'OCULTA', etiqueta: 'Ocultas', vacio: 'Todavía no hay reseñas ocultas' },
];

/** Texto de una etiqueta de cualquiera de los dos lados (estacionamiento o conductor). */
const TEXTO_CUALQUIER_ETIQUETA: Record<string, string> = { ...TEXTO_ETIQUETA, ...TEXTO_ETIQUETA_CONDUCTOR };

/**
 * Pantalla `/admin/resenas` · rol ADMINISTRADOR
 *
 * Reseñas que denuncio la parte calificada. El administrador desestima la
 * denuncia (no cambia nada) u oculta la reseña: deja de contar en la
 * reputacion y de mostrarse. La denuncia que espera hace mas, primero.
 */
@Component({
  selector: 'app-resenas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Boton, Cargando, Chip, EstadoVacio, Modal, Tarjeta, DatePipe],
  templateUrl: './resenas.html',
  styleUrl: './resenas.css',
})
export class Resenas {
  private readonly admin = inject(AdminService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

  protected readonly filtros = FILTROS;
  protected readonly textoMotivo = TEXTO_MOTIVO_DENUNCIA;
  protected readonly formatearNota = formatearNota;

  /** El filtro vive en la URL (`?estado=`), como en Disputas. Uno que no existe cae en Pendientes. */
  protected readonly estado = toSignal(
    this.ruta.queryParamMap.pipe(
      map((params) => {
        const estado = params.get('estado');
        return FILTROS.find((filtro) => filtro.estado === estado)?.estado ?? 'PENDIENTE';
      }),
    ),
    { initialValue: 'PENDIENTE' as EstadoDenunciaResena },
  );

  protected readonly filtroActual = () =>
    FILTROS.find((filtro) => filtro.estado === this.estado()) ?? FILTROS[0];

  protected readonly recurso = rxResource({
    params: () => this.estado(),
    stream: ({ params }) => this.admin.resenas(params),
    defaultValue: [] as ResenaDenunciada[],
  });

  protected readonly procesandoId = signal<string | null>(null);
  protected readonly aOcultar = signal<ResenaDenunciada | null>(null);
  protected readonly aviso = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  protected elegir(estado: EstadoDenunciaResena): void {
    void this.router.navigate([], { queryParams: { estado }, replaceUrl: true });
  }

  protected textoEtiqueta(codigo: string): string {
    return TEXTO_CUALQUIER_ETIQUETA[codigo] ?? codigo;
  }

  /** "Sobre Garage Centro" o "Sobre Ana Paz (conductor)". */
  protected sobreQuien(resena: ResenaDenunciada): string {
    return resena.autor === 'CONDUCTOR'
      ? `Sobre ${resena.estacionamiento.nombre}`
      : `Sobre ${resena.conductor.nombre} (conductor)`;
  }

  /** Quien la escribio: el conductor, o el estacionamiento al calificar al conductor. */
  protected autor(resena: ResenaDenunciada): string {
    return resena.autor === 'CONDUCTOR'
      ? `Escribió ${resena.conductor.nombre}`
      : `Escribió ${resena.estacionamiento.nombre}`;
  }

  protected desestimar(resena: ResenaDenunciada): void {
    this.moderar(resena, 'desestimar');
  }

  protected ocultar(resena: ResenaDenunciada): void {
    this.moderar(resena, 'ocultar');
  }

  /** Desestima u oculta la reseña; siempre recarga la cola (otro admin pudo resolverla). */
  private moderar(resena: ResenaDenunciada, accion: 'desestimar' | 'ocultar'): void {
    this.procesandoId.set(resena.id);
    this.aviso.set(null);
    this.error.set(null);
    const pedido = accion === 'ocultar' ? this.admin.ocultarResena(resena.id) : this.admin.desestimarResena(resena.id);
    pedido.subscribe({
      next: () => {
        this.procesandoId.set(null);
        this.aOcultar.set(null);
        this.aviso.set(accion === 'ocultar' ? 'Ocultaste la reseña: ya no cuenta en la reputación.' : 'Desestimaste la denuncia.');
        this.recurso.reload();
      },
      error: (e: Error) => {
        this.procesandoId.set(null);
        this.aOcultar.set(null);
        this.error.set(e.message);
        // Otro admin pudo haberla resuelto: la cola se pone al dia.
        this.recurso.reload();
      },
    });
  }
}
