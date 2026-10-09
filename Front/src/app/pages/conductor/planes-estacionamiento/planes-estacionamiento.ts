import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { Boton, Cargando, EstadoVacio, Tarjeta } from '@app/components/ui';
import { Id, PlanAbono, TURNOS } from '@app/models';
import { AbonoService } from '@app/services/abono.service';
import { EstacionamientoService } from '@app/services/estacionamiento.service';

/**
 * Pantalla `/conductor/abonos/estacionamiento/:estacionamientoId` · rol CONDUCTOR
 *
 * Los planes de abono de un estacionamiento. Comprar uno es pagar por
 * adelantado (simulado) sus usos; despues se reserva gratis en "Mis abonos".
 */
@Component({
  selector: 'app-planes-estacionamiento',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Boton, Cargando, EstadoVacio, Tarjeta, RouterLink],
  template: `
    <div class="aparece mx-auto w-full max-w-[640px] px-6 pt-5 pb-8 lg:px-10 lg:pt-[34px] lg:pb-11">
      <div class="flex flex-col gap-6">
        <header>
          <p class="eyebrow">Abonos mensuales</p>
          <h1 class="titulo-vista mt-1.5">
            {{ estacionamiento.hasValue() ? estacionamiento.value().nombre : 'Estacionamiento' }}
          </h1>
          <p class="mt-2 text-[13px] text-plomo">
            Pagás ahora una cantidad de usos en un turno y reservás gratis dentro de ese horario
            durante 30 días. El abono no reserva lugar: cada reserva depende de que haya cochera libre.
          </p>
        </header>

        @if (planes.status() === 'loading') {
          <ui-cargando [cantidad]="2" />
        } @else if (planes.error(); as e) {
          <ui-estado-vacio titulo="No pudimos cargar los abonos" [descripcion]="e.message">
            <ui-boton (presionado)="planes.reload()">Reintentar</ui-boton>
          </ui-estado-vacio>
        } @else if (planes.value().length === 0) {
          <ui-estado-vacio titulo="Este estacionamiento no ofrece abonos" descripcion="Podés reservar por hora, estadía o jornada.">
            <ui-boton routerLink="/conductor/explorar">Volver a explorar</ui-boton>
          </ui-estado-vacio>
        } @else {
          @for (plan of planes.value(); track plan.id) {
            <ui-tarjeta>
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p class="text-[15px] font-semibold text-tinta">
                    Turno {{ turnos[plan.turno].etiqueta.toLowerCase() }}
                    <span class="font-normal text-plomo">· {{ turnos[plan.turno].desde }} a {{ turnos[plan.turno].hasta }}</span>
                  </p>
                  <p class="mt-1 text-[13px] text-plomo">
                    {{ plan.cupos }} usos · $ {{ plan.precio.toLocaleString('es-AR') }} · 30 días
                  </p>
                </div>
                <ui-boton variante="primario" [cargando]="comprandoId() === plan.id" (presionado)="comprar(plan)">
                  Comprar
                </ui-boton>
              </div>
            </ui-tarjeta>
          }
        }

        @if (error(); as mensaje) {
          <p class="text-[13px] text-ocupada" role="alert">{{ mensaje }}</p>
        }
      </div>
    </div>
  `,
})
export class PlanesEstacionamiento {
  private readonly abonos = inject(AbonoService);
  private readonly estacionamientos = inject(EstacionamientoService);
  private readonly router = inject(Router);

  readonly estacionamientoId = input.required<Id>();

  protected readonly turnos = TURNOS;
  protected readonly comprandoId = signal<Id | null>(null);
  protected readonly error = signal<string | null>(null);

  protected readonly estacionamiento = rxResource({
    params: () => this.estacionamientoId(),
    stream: ({ params }) => this.estacionamientos.obtener(params),
  });

  protected readonly planes = rxResource({
    params: () => this.estacionamientoId(),
    stream: ({ params }) => this.abonos.planes(params),
    defaultValue: [] as PlanAbono[],
  });

  protected comprar(plan: PlanAbono): void {
    this.comprandoId.set(plan.id);
    this.error.set(null);
    this.abonos.comprar(plan.id).subscribe({
      next: () => void this.router.navigate(['/conductor/abonos']),
      error: (e: Error) => {
        this.comprandoId.set(null);
        this.error.set(e.message);
      },
    });
  }
}
