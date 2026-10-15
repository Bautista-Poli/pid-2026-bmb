import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { Boton, Cargando, Chip, EstadoVacio, Miniatura, Tarjeta } from '@app/components/ui';
import { EstacionamientoEnRevision, EstadoAprobacion } from '@app/models';
import { AdminService } from '@app/services/admin.service';

const FILTROS: { estado: EstadoAprobacion; etiqueta: string; vacio: string }[] = [
  { estado: 'PENDIENTE', etiqueta: 'Pendientes', vacio: 'No hay estacionamientos esperando revisión' },
  { estado: 'APROBADO', etiqueta: 'Aprobados', vacio: 'Todavía no aprobaste estacionamientos' },
  { estado: 'RECHAZADO', etiqueta: 'Rechazados', vacio: 'No hay estacionamientos rechazados' },
];

/**
 * Pantalla `/admin/pendientes` · rol ADMINISTRADOR
 *
 * La cola de revision: los estacionamientos que esperan aprobacion, el que
 * espera hace mas primero. Los chips muestran tambien los ya revisados.
 */
@Component({
  selector: 'app-pendientes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Boton, Cargando, Chip, EstadoVacio, Miniatura, Tarjeta, RouterLink, DatePipe],
  templateUrl: './pendientes.html',
  styleUrl: './pendientes.css',
})
export class Pendientes {
  private readonly admin = inject(AdminService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

  protected readonly filtros = FILTROS;

  /** El filtro vive en la URL (`?estado=`) para que volver del detalle lo conserve. */
  protected readonly estado = toSignal(
    this.ruta.queryParamMap.pipe(
      map((params) => (params.get('estado') as EstadoAprobacion | null) ?? 'PENDIENTE'),
    ),
    { initialValue: 'PENDIENTE' as EstadoAprobacion },
  );

  protected readonly filtroActual = () =>
    FILTROS.find((filtro) => filtro.estado === this.estado()) ?? FILTROS[0];

  protected readonly recurso = rxResource({
    params: () => this.estado(),
    stream: ({ params }) => this.admin.listarEstacionamientos(params),
    defaultValue: [] as EstacionamientoEnRevision[],
  });

  protected elegir(estado: EstadoAprobacion): void {
    void this.router.navigate([], { queryParams: { estado }, replaceUrl: true });
  }
}
