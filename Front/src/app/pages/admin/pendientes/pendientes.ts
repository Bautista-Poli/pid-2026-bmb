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
  template: `
    <div class="aparece mx-auto w-full max-w-[860px] px-6 pt-5 pb-8 lg:px-10 lg:pt-[34px] lg:pb-11">
      <div class="flex flex-col gap-6">
        <header>
          <p class="eyebrow">Administración</p>
          <h1 class="titulo-vista mt-1.5">Revisión de estacionamientos</h1>
          <p class="mt-1 text-[13.5px] text-plomo">
            Un estacionamiento aparece en la búsqueda recién cuando lo aprobás.
          </p>
        </header>

        <div class="flex gap-2 overflow-x-auto pb-1">
          @for (filtro of filtros; track filtro.estado) {
            <ui-chip [activo]="filtro.estado === estado()" (alternar)="elegir(filtro.estado)">
              {{ filtro.etiqueta }}
            </ui-chip>
          }
        </div>

        @if (recurso.isLoading()) {
          <ui-cargando [cantidad]="3" />
        } @else if (recurso.error(); as e) {
          <ui-estado-vacio titulo="No pudimos cargar la cola" [descripcion]="e.message">
            <ui-boton (presionado)="recurso.reload()">Reintentar</ui-boton>
          </ui-estado-vacio>
        } @else if (recurso.value().length === 0) {
          <ui-estado-vacio [titulo]="filtroActual().vacio" />
        } @else {
          <ul class="aparece-en-cadena flex flex-col gap-3">
            @for (estacionamiento of recurso.value(); track estacionamiento.id) {
              <li>
                <a class="block" [routerLink]="['/admin/estacionamientos', estacionamiento.id]">
                  <ui-tarjeta>
                    <div class="flex items-center gap-4">
                      <ui-miniatura [src]="estacionamiento.fotoUrl" icono="estacionamiento" tamano="sm" />
                      <div class="min-w-0 flex-1">
                        <p class="truncate text-[15px] font-semibold text-tinta">{{ estacionamiento.nombre }}</p>
                        <p class="mt-0.5 truncate text-[13px] text-grafito">
                          {{ estacionamiento.direccion.calle }} {{ estacionamiento.direccion.numero }},
                          {{ estacionamiento.direccion.ciudad }}
                        </p>
                        <p class="mt-0.5 truncate text-[12.5px] text-plomo">
                          {{ estacionamiento.propietario.nombre }} {{ estacionamiento.propietario.apellido }} ·
                          {{ estacionamiento.propietario.email }}
                        </p>
                      </div>
                      <p class="num-tabular shrink-0 text-right text-[12px] text-plomo">
                        Enviado<br />{{ estacionamiento.enviadoEn | date: 'd MMM, HH:mm' }}
                      </p>
                    </div>
                  </ui-tarjeta>
                </a>
              </li>
            }
          </ul>
        }
      </div>
    </div>
  `,
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
