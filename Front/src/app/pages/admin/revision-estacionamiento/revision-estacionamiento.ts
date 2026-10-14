import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { GaleriaFotos, MapaEstacionamientos } from '@app/components/estacionamiento';
import { Boton, Cargando, EstadoVacio, Etiqueta, Modal, Tarjeta, TonoEtiqueta } from '@app/components/ui';
import { EstacionamientoEnRevision, EstadoAprobacion } from '@app/models';
import { AdminService } from '@app/services/admin.service';

const MOTIVO_MIN = 10;
const MOTIVO_MAX = 300;

const ETIQUETA_ESTADO: Record<EstadoAprobacion, string> = {
  PENDIENTE: 'Pendiente',
  APROBADO: 'Aprobado',
  RECHAZADO: 'Rechazado',
};

const TONO_ESTADO: Record<EstadoAprobacion, TonoEtiqueta> = {
  PENDIENTE: 'aviso',
  APROBADO: 'exito',
  RECHAZADO: 'peligro',
};

const pesos = (monto: number | null) => (monto === null ? null : `$ ${monto.toLocaleString('es-AR')}`);

/**
 * Pantalla `/admin/estacionamientos/:estacionamientoId` · rol ADMINISTRADOR
 *
 * Todo lo que hace falta para decidir: fotos, ubicacion, horarios, tarifas,
 * cocheras y el propietario. Si esta pendiente, se aprueba o se rechaza con un
 * motivo que despues ve el propietario.
 */
@Component({
  selector: 'app-revision-estacionamiento',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    Boton,
    Cargando,
    DatePipe,
    Etiqueta,
    EstadoVacio,
    FormsModule,
    GaleriaFotos,
    MapaEstacionamientos,
    Modal,
    RouterLink,
    Tarjeta,
  ],
  template: `
    <div class="aparece mx-auto w-full max-w-[860px] px-6 pt-5 pb-8 lg:px-10 lg:pt-[34px] lg:pb-11">
      <a class="text-[12.5px] font-medium text-acento hover:text-acento-fuerte" routerLink="/admin/pendientes">
        ← Volver a la revisión
      </a>

      @if (recurso.isLoading()) {
        <div class="mt-5"><ui-cargando [cantidad]="2" /></div>
      } @else if (recurso.error(); as e) {
        <div class="mt-5">
          <ui-estado-vacio titulo="No pudimos cargar el estacionamiento" [descripcion]="e.message">
            <ui-boton (presionado)="recurso.reload()">Reintentar</ui-boton>
          </ui-estado-vacio>
        </div>
      } @else if (recurso.value(); as e) {
        <div class="mt-4 flex flex-col gap-5">
          <header class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <h1 class="titulo-vista">{{ e.nombre }}</h1>
              <p class="mt-1 text-[13.5px] text-grafito">
                {{ e.direccion.calle }} {{ e.direccion.numero }}, {{ e.direccion.ciudad }},
                {{ e.direccion.provincia }}
              </p>
              <p class="mt-1 text-[12.5px] text-plomo">Enviado {{ e.enviadoEn | date: 'd MMM y, HH:mm' }}</p>
            </div>
            <ui-etiqueta [tono]="tonoEstado[e.estadoAprobacion]">
              {{ etiquetaEstado[e.estadoAprobacion] }}
            </ui-etiqueta>
          </header>

          @if (e.estadoAprobacion === 'RECHAZADO' && e.motivoRechazo) {
            <p class="rounded-control border border-ocupada/25 bg-ocupada/5 px-4 py-3 text-[13px] text-ocupada">
              Rechazado: {{ e.motivoRechazo }}
            </p>
          }

          @if (e.estadoAprobacion === 'PENDIENTE') {
            <div class="flex flex-wrap gap-2">
              <ui-boton variante="primario" (presionado)="abrirAprobacion()">Aprobar</ui-boton>
              <ui-boton variante="peligro" (presionado)="abrirRechazo()">Rechazar</ui-boton>
            </div>
          }

          @if (e.fotos.length > 0) {
            <app-galeria-fotos [fotos]="e.fotos" [nombre]="e.nombre" />
          } @else {
            <p class="text-[13px] text-plomo">No cargó fotos.</p>
          }

          <div class="grid gap-5 md:grid-cols-2">
            <ui-tarjeta>
              <h2 class="text-[14px] font-semibold text-tinta">Propietario</h2>
              <p class="mt-2 text-[13.5px] text-grafito">
                {{ e.propietario.nombre }} {{ e.propietario.apellido }}
              </p>
              <p class="text-[13px] text-plomo">{{ e.propietario.email }}</p>
              @if (e.propietario.telefono) {
                <p class="text-[13px] text-plomo">{{ e.propietario.telefono }}</p>
              }
            </ui-tarjeta>

            <ui-tarjeta>
              <h2 class="text-[14px] font-semibold text-tinta">Tarifas y cocheras</h2>
              <ul class="mt-2 flex flex-col gap-0.5 text-[13px] text-grafito">
                @for (tarifa of tarifas(); track tarifa.etiqueta) {
                  <li>{{ tarifa.etiqueta }}: {{ tarifa.valor ?? 'no ofrece' }}</li>
                }
                <li class="mt-1">
                  {{ e.cocherasTotales }} cochera(s) activas · {{ e.cubierto ? 'Cubierto' : 'Descubierto' }}
                </li>
              </ul>
            </ui-tarjeta>

            <ui-tarjeta>
              <h2 class="text-[14px] font-semibold text-tinta">Horarios</h2>
              @if (e.horarios.length === 0) {
                <p class="mt-2 text-[13px] text-plomo">No cargó horarios.</p>
              } @else {
                <ul class="num-tabular mt-2 flex flex-col gap-0.5 text-[13px] text-grafito">
                  @for (franja of e.horarios; track franja.dia) {
                    <li>
                      <span class="inline-block w-24 lowercase first-letter:uppercase">{{ franja.dia }}</span>
                      {{ franja.desde }} a {{ franja.hasta }}
                    </li>
                  }
                </ul>
              }
            </ui-tarjeta>

            @if (e.descripcion) {
              <ui-tarjeta>
                <h2 class="text-[14px] font-semibold text-tinta">Descripción</h2>
                <p class="mt-2 text-[13px] whitespace-pre-line text-grafito">{{ e.descripcion }}</p>
              </ui-tarjeta>
            }
          </div>

          @if (e.direccion.latitud !== null && e.direccion.longitud !== null) {
            <div class="h-[280px] overflow-hidden rounded-control border border-borde">
              <app-mapa-estacionamientos [estacionamientos]="[e]" [seleccionadoId]="e.id" />
            </div>
          } @else {
            <p class="text-[13px] text-plomo">La dirección no tiene coordenadas: verificala a mano.</p>
          }
        </div>

        <ui-modal
          titulo="Aprobar estacionamiento"
          [abierto]="aprobando()"
          (cerrado)="aprobando.set(false)"
        >
          <div class="flex flex-col gap-4">
            <p class="text-[13.5px] text-grafito">
              ¿Aprobar {{ e.nombre }}? Si el propietario lo tiene publicado, va a aparecer en la búsqueda.
            </p>
            @if (error(); as mensaje) {
              <p class="text-[13px] text-ocupada" role="alert">{{ mensaje }}</p>
            }
            <ui-boton variante="primario" [bloque]="true" [cargando]="guardando()" (presionado)="aprobar(e)">
              Aprobar
            </ui-boton>
          </div>
        </ui-modal>

        <ui-modal
          titulo="Rechazar estacionamiento"
          [abierto]="rechazando()"
          (cerrado)="rechazando.set(false)"
        >
          <div class="flex flex-col gap-4">
            <label class="campo">
              <span class="label-campo">Motivo (lo ve el propietario)</span>
              <textarea
                rows="4"
                [maxLength]="motivoMax"
                [ngModel]="motivo()"
                (ngModelChange)="motivo.set($event)"
                placeholder="Por ejemplo: las fotos no muestran la entrada del estacionamiento."
              ></textarea>
              <span class="campo-ayuda num-tabular">
                {{ motivo().trim().length }}/{{ motivoMax }} · mínimo {{ motivoMin }}
              </span>
            </label>
            @if (error(); as mensaje) {
              <p class="text-[13px] text-ocupada" role="alert">{{ mensaje }}</p>
            }
            <ui-boton
              variante="peligro"
              [bloque]="true"
              [cargando]="guardando()"
              [deshabilitado]="motivo().trim().length < motivoMin"
              (presionado)="rechazar(e)"
            >
              Rechazar
            </ui-boton>
          </div>
        </ui-modal>
      }
    </div>
  `,
})
export class RevisionEstacionamiento {
  private readonly admin = inject(AdminService);
  private readonly router = inject(Router);

  /** Parametro de ruta (withComponentInputBinding). */
  readonly estacionamientoId = input.required<string>();

  protected readonly motivoMin = MOTIVO_MIN;
  protected readonly motivoMax = MOTIVO_MAX;
  protected readonly etiquetaEstado = ETIQUETA_ESTADO;
  protected readonly tonoEstado = TONO_ESTADO;

  protected readonly aprobando = signal(false);
  protected readonly rechazando = signal(false);
  protected readonly motivo = signal('');
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly recurso = rxResource({
    params: () => this.estacionamientoId(),
    stream: ({ params }) => this.admin.obtenerEstacionamiento(params),
  });

  protected readonly tarifas = computed(() => {
    const tarifas = this.recurso.value()?.tarifas;
    if (!tarifas) return [];
    return [
      { etiqueta: 'Por hora', valor: pesos(tarifas.hora) },
      { etiqueta: 'Estadía (12 h)', valor: pesos(tarifas.estadia) },
      { etiqueta: 'Jornada (24 h)', valor: pesos(tarifas.jornada) },
    ];
  });

  protected abrirAprobacion(): void {
    this.error.set(null);
    this.aprobando.set(true);
  }

  protected abrirRechazo(): void {
    this.motivo.set('');
    this.error.set(null);
    this.rechazando.set(true);
  }

  protected aprobar(estacionamiento: EstacionamientoEnRevision): void {
    this.decidir(this.admin.aprobar(estacionamiento.id, estacionamiento.enviadoEn));
  }

  protected rechazar(estacionamiento: EstacionamientoEnRevision): void {
    this.decidir(this.admin.rechazar(estacionamiento.id, this.motivo().trim(), estacionamiento.enviadoEn));
  }

  /** Aprobar o rechazar: al terminar vuelve a la cola, que ya no lo muestra. */
  private decidir(pedido: Observable<EstacionamientoEnRevision>): void {
    this.guardando.set(true);
    this.error.set(null);
    pedido.subscribe({
      next: () => {
        this.guardando.set(false);
        void this.router.navigate(['/admin/pendientes']);
      },
      error: (e: Error) => {
        this.guardando.set(false);
        this.error.set(e.message);
      },
    });
  }
}
