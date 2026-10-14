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
  template: `
    <div class="aparece mx-auto w-full max-w-[860px] px-6 pt-5 pb-8 lg:px-10 lg:pt-[34px] lg:pb-11">
      <div class="flex flex-col gap-6">
        <header>
          <p class="eyebrow">Administración</p>
          <h1 class="titulo-vista mt-1.5">Disputas</h1>
          <p class="mt-1 text-[13.5px] text-plomo">
            Casos en los que el conductor y el estacionamiento no se pusieron de acuerdo. Escribile a cada
            parte por su chat privado y resolvé, con devolución si corresponde.
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
          <ui-estado-vacio titulo="No pudimos cargar las disputas" [descripcion]="e.message">
            <ui-boton (presionado)="recurso.reload()">Reintentar</ui-boton>
          </ui-estado-vacio>
        } @else if (recurso.value().length === 0) {
          <ui-estado-vacio [titulo]="filtroActual().vacio" />
        } @else {
          <ul class="aparece-en-cadena flex flex-col gap-3">
            @for (incidencia of recurso.value(); track incidencia.id) {
              <li>
                <a class="block" [routerLink]="['/admin/disputas', incidencia.id]">
                  <ui-tarjeta>
                    <div class="flex items-start gap-4">
                      <div class="min-w-0 flex-1">
                        <p class="truncate text-[15px] font-semibold text-tinta">
                          {{ etiquetaTipo[incidencia.tipo] }}
                          @if (incidencia.motivo; as motivo) {
                            <span class="font-normal text-plomo">· {{ etiquetaMotivo[motivo] }}</span>
                          }
                        </p>
                        <p class="mt-0.5 truncate text-[13px] text-grafito">
                          {{ incidencia.estacionamiento.nombre }} · {{ incidencia.conductor.nombre }}
                        </p>
                        @if (incidencia.denunciadaPor; as quien) {
                          <p class="mt-0.5 text-[12.5px] text-plomo">
                            Denunció: {{ etiquetaAutor[quien].toLowerCase() }}
                          </p>
                        }
                      </div>
                      <div class="flex shrink-0 flex-col items-end gap-1.5">
                        @if (incidencia.resolucion; as resolucion) {
                          <ui-etiqueta tono="neutro">{{ etiquetaResolucion[resolucion] }}</ui-etiqueta>
                        }
                        <p class="num-tabular text-right text-[12px] text-plomo">
                          Denunciada<br />{{ incidencia.denunciadaEn | date: 'd MMM, HH:mm' }}
                        </p>
                      </div>
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
