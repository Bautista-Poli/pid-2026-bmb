import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { Boton, Cargando, Chip, EstadoVacio, Etiqueta, Tarjeta } from '@app/components/ui';
import {
  ETIQUETA_AUTOR,
  ETIQUETA_MOTIVO_RECLAMO,
  ETIQUETA_RESOLUCION,
  ETIQUETA_TIPO_INCIDENCIA,
  EstadoIncidencia,
  Incidencia,
} from '@app/models';
import { AdminService } from '@app/services/admin.service';

const FILTROS: { estado: EstadoIncidencia; etiqueta: string; vacio: string }[] = [
  { estado: 'DENUNCIADA', etiqueta: 'Pendientes', vacio: 'No hay disputas pendientes' },
  { estado: 'RESUELTA', etiqueta: 'Resueltas', vacio: 'Todavía no hay disputas resueltas' },
];

/**
 * Pantalla `/admin/disputas` · rol ADMINISTRADOR
 *
 * Incidencias que alguna de las partes denuncio porque no llegaron a un
 * acuerdo (reclamos de conductores y avisos del sistema). La que espera hace
 * mas, primero.
 */
@Component({
  selector: 'app-disputas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Boton, Cargando, Chip, EstadoVacio, Etiqueta, Tarjeta, RouterLink, DatePipe],
  templateUrl: './disputas.html',
  styleUrl: './disputas.css',
})
export class Disputas {
  private readonly admin = inject(AdminService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

  protected readonly filtros = FILTROS;
  protected readonly etiquetaTipo = ETIQUETA_TIPO_INCIDENCIA;
  protected readonly etiquetaMotivo = ETIQUETA_MOTIVO_RECLAMO;
  protected readonly etiquetaResolucion = ETIQUETA_RESOLUCION;
  protected readonly etiquetaAutor = ETIQUETA_AUTOR;

  /** El filtro vive en la URL (`?estado=`) para que volver del detalle lo conserve. */
  protected readonly estado = toSignal(
    this.ruta.queryParamMap.pipe(
      map((params) => (params.get('estado') as EstadoIncidencia | null) ?? 'DENUNCIADA'),
    ),
    { initialValue: 'DENUNCIADA' as EstadoIncidencia },
  );

  protected readonly filtroActual = () =>
    FILTROS.find((filtro) => filtro.estado === this.estado()) ?? FILTROS[0];

  protected readonly recurso = rxResource({
    params: () => this.estado(),
    stream: ({ params }) => this.admin.incidencias(params),
    defaultValue: [] as Incidencia[],
  });

  protected elegir(estado: EstadoIncidencia): void {
    void this.router.navigate([], { queryParams: { estado }, replaceUrl: true });
  }
}
