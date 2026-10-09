import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { Boton, Cargando } from '@app/components/ui';
import { Abono, Id, ORDEN_TURNOS, PlanAbono, TURNOS, TurnoAbono } from '@app/models';
import { AbonoService } from '@app/services/abono.service';

/**
 * Seccion "Abonos" del estacionamiento: un plan por turno (usos y precio) y
 * la lista de abonos vendidos. El abono no reserva lugar: da usos prepagos
 * para reservar gratis dentro del turno.
 */
@Component({
  selector: 'app-planes-abono',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Boton, Cargando, DatePipe],
  template: `
    <section
      class="flex flex-col gap-4 rounded-tarjeta border border-borde bg-papel px-5 py-4 shadow-tarjeta"
      aria-labelledby="titulo-abonos"
    >
      <div>
        <h2 id="titulo-abonos" class="text-[14px] font-semibold text-tinta">Abonos mensuales</h2>
        <p class="mt-1 text-[13px] text-plomo">
          El conductor paga por adelantado una cantidad de usos en un turno y después reserva gratis
          dentro de ese horario. Vale 30 días.
        </p>
      </div>

      @if (planes.error(); as fallo) {
        <p class="text-[13px] text-ocupada" role="alert">
          No pudimos cargar los abonos: {{ mensaje(fallo) }}
        </p>
        <div><ui-boton variante="secundario" tamano="sm" (presionado)="planes.reload()">Reintentar</ui-boton></div>
      } @else if (planes.status() === 'loading') {
        <ui-cargando [cantidad]="1" />
      } @else {
        <div class="flex flex-col divide-y divide-borde-sutil">
          @for (turno of ordenTurnos; track turno) {
            <form
              class="flex flex-wrap items-end gap-3 py-3"
              (submit)="$event.preventDefault(); guardar(turno, cupos.valueAsNumber, precio.valueAsNumber)"
            >
              <div class="w-32">
                <p class="text-[13px] font-semibold text-tinta">{{ turnos[turno].etiqueta }}</p>
                <p class="text-[12px] text-plomo">{{ turnos[turno].desde }} a {{ turnos[turno].hasta }}</p>
              </div>
              <label class="flex flex-col gap-1 text-[12px] text-plomo">
                Usos
                <input #cupos type="number" min="1" max="100" required
                  class="h-10 w-24 rounded-boton border border-borde bg-papel px-3 text-[14px] text-tinta"
                  [value]="planDe(turno)?.cupos ?? ''" />
              </label>
              <label class="flex flex-col gap-1 text-[12px] text-plomo">
                Precio ($)
                <input #precio type="number" min="0" required
                  class="h-10 w-32 rounded-boton border border-borde bg-papel px-3 text-[14px] text-tinta"
                  [value]="planDe(turno)?.precio ?? ''" />
              </label>
              <ui-boton tipo="submit" variante="primario" tamano="sm" [cargando]="guardando() === turno">
                {{ planDe(turno) ? 'Guardar' : 'Ofrecer' }}
              </ui-boton>
              @if (planDe(turno); as plan) {
                @if (confirmandoBaja() === plan.id) {
                  <ui-boton variante="peligro" tamano="sm" [cargando]="dandoDeBaja() === plan.id" (presionado)="quitar(plan)">
                    Sí, dejar de ofrecer
                  </ui-boton>
                  <ui-boton variante="secundario" tamano="sm" [deshabilitado]="dandoDeBaja() !== null" (presionado)="confirmandoBaja.set(null)">
                    Cancelar
                  </ui-boton>
                } @else {
                  <ui-boton variante="peligro" tamano="sm" (presionado)="confirmandoBaja.set(plan.id)">Dejar de ofrecer</ui-boton>
                }
              }
            </form>
          }
        </div>
      }

      @if (error(); as mensaje) {
        <p class="text-[13px] text-ocupada" role="alert">{{ mensaje }}</p>
      }

      <div>
        <h3 class="text-[13px] font-semibold text-tinta">Vendidos</h3>
        @if (vendidos.error(); as fallo) {
          <p class="mt-1 text-[13px] text-ocupada" role="alert">
            No pudimos cargar los abonos: {{ mensaje(fallo) }}
          </p>
          <div class="mt-2"><ui-boton variante="secundario" tamano="sm" (presionado)="vendidos.reload()">Reintentar</ui-boton></div>
        } @else if (vendidos.status() === 'loading') {
          <ui-cargando [cantidad]="1" />
        } @else if (vendidos.value().length === 0) {
          <p class="mt-1 text-[13px] text-plomo">Todavía no vendiste abonos.</p>
        } @else {
          <ul class="mt-2 flex flex-col gap-1.5 text-[13px]">
            @for (abono of vendidos.value(); track abono.id) {
              <li class="flex flex-wrap justify-between gap-2">
                <span class="text-tinta">{{ abono.conductor }} · {{ turnos[abono.turno].etiqueta }}</span>
                <span class="text-plomo">
                  {{ abono.cuposUsados }} de {{ abono.cuposTotales }} usos · hasta
                  {{ abono.hasta | date: 'd MMM' }} · {{ abono.estado.toLowerCase() }}
                </span>
              </li>
            }
          </ul>
        }
      </div>
    </section>
  `,
})
export class PlanesAbono {
  private readonly abonos = inject(AbonoService);

  readonly estacionamientoId = input.required<Id>();

  protected readonly turnos = TURNOS;
  protected readonly ordenTurnos = ORDEN_TURNOS;

  protected readonly guardando = signal<TurnoAbono | null>(null);
  protected readonly confirmandoBaja = signal<Id | null>(null);
  protected readonly dandoDeBaja = signal<Id | null>(null);
  protected readonly error = signal<string | null>(null);

  protected readonly planes = rxResource({
    params: () => this.estacionamientoId(),
    stream: ({ params }) => this.abonos.planes(params),
    defaultValue: [] as PlanAbono[],
  });

  protected readonly vendidos = rxResource({
    params: () => this.estacionamientoId(),
    stream: ({ params }) => this.abonos.vendidos(params),
    defaultValue: [] as Abono[],
  });

  private readonly porTurno = computed(
    () => new Map((this.planes.hasValue() ? this.planes.value() : []).map((plan) => [plan.turno, plan])),
  );

  protected mensaje(e: unknown): string {
    return e instanceof Error ? e.message : 'Error inesperado.';
  }

  protected planDe(turno: TurnoAbono): PlanAbono | undefined {
    return this.porTurno().get(turno);
  }

  protected guardar(turno: TurnoAbono, cupos: number, precio: number): void {
    if (!Number.isInteger(cupos) || cupos < 1 || !Number.isFinite(precio) || precio < 0) {
      this.error.set('Completá usos (1 o más) y precio (0 o más).');
      return;
    }
    const existente = this.planDe(turno);
    const llamada = existente
      ? this.abonos.actualizarPlan(this.estacionamientoId(), existente.id, { cupos, precio })
      : this.abonos.crearPlan(this.estacionamientoId(), { turno, cupos, precio });

    this.guardando.set(turno);
    this.error.set(null);
    llamada.subscribe({
      next: () => {
        this.guardando.set(null);
        this.planes.reload();
      },
      error: (e: Error) => {
        this.guardando.set(null);
        this.error.set(e.message);
      },
    });
  }

  protected quitar(plan: PlanAbono): void {
    this.error.set(null);
    this.dandoDeBaja.set(plan.id);
    this.abonos.darDeBajaPlan(this.estacionamientoId(), plan.id).subscribe({
      next: () => {
        this.dandoDeBaja.set(null);
        this.confirmandoBaja.set(null);
        this.planes.reload();
      },
      error: (e: Error) => {
        this.dandoDeBaja.set(null);
        this.confirmandoBaja.set(null);
        this.error.set(e.message);
      },
    });
  }
}
