import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { Boton, Cargando, EstadoVacio, Tarjeta } from '@app/components/ui';
import { Abono, HoraHHmm, Id, TURNOS, Vehiculo } from '@app/models';
import { AbonoService } from '@app/services/abono.service';
import { ReservaService } from '@app/services/reserva.service';
import { VehiculoService } from '@app/services/vehiculo.service';
import { aFechaISO } from '@app/utils/fecha.util';

const dosDigitos = (n: number) => String(n).padStart(2, '0');

/**
 * Pantalla `/conductor/abonos/:abonoId/reservar` · rol CONDUCTOR
 *
 * Reserva gratis con un abono: vehiculo, dia y horario dentro del turno.
 * Descuenta un uso; la cochera la asigna el backend como en cualquier reserva.
 */
@Component({
  selector: 'app-reservar-con-abono',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Boton, Cargando, EstadoVacio, Tarjeta, RouterLink],
  template: `
    <div class="aparece mx-auto w-full max-w-[560px] px-6 pt-5 pb-8 lg:px-10 lg:pt-[34px] lg:pb-11">
      <div class="flex flex-col gap-6">
        <header>
          <p class="eyebrow">Reservar con abono</p>
          <h1 class="titulo-vista mt-1.5">{{ abono()?.estacionamiento ?? 'Abono' }}</h1>
        </header>

        @if (misAbonos.status() === 'loading' || vehiculos.status() === 'loading') {
          <ui-cargando [cantidad]="1" />
        } @else if (misAbonos.error() ?? vehiculos.error(); as e) {
          <ui-estado-vacio titulo="No pudimos cargar los datos del abono" [descripcion]="e.message">
            <ui-boton (presionado)="reintentar()">Reintentar</ui-boton>
          </ui-estado-vacio>
        } @else if (!abono()) {
          <ui-estado-vacio titulo="No encontramos ese abono">
            <ui-boton routerLink="/conductor/abonos">Ir a mis abonos</ui-boton>
          </ui-estado-vacio>
        } @else if (abono(); as a) {
          <ui-tarjeta>
            <form class="flex flex-col gap-4" (submit)="$event.preventDefault(); confirmar(a, vehiculo.value, fecha.value, desde.value, hasta.value)">
              <p class="text-[13px] text-plomo">
                Turno {{ turnos[a.turno].etiqueta.toLowerCase() }} ({{ turnos[a.turno].desde }} a
                {{ turnos[a.turno].hasta }}) · te quedan {{ a.cuposRestantes }} usos · vale hasta el {{ a.hasta }}
              </p>
              <label class="flex flex-col gap-1 text-[12.5px] text-plomo">
                Vehículo
                <select #vehiculo class="h-10 rounded-boton border border-borde bg-papel px-3 text-[14px] text-tinta">
                  @for (v of vehiculos.value(); track v.id) {
                    <option [value]="v.id" [selected]="v.predeterminado">{{ v.patente }}</option>
                  }
                </select>
              </label>
              <label class="flex flex-col gap-1 text-[12.5px] text-plomo">
                Día
                <input #fecha type="date" required [min]="minimo(a)" [max]="a.hasta" [value]="minimo(a)"
                  class="h-10 rounded-boton border border-borde bg-papel px-3 text-[14px] text-tinta" />
              </label>
              <div class="flex gap-3">
                <label class="flex flex-1 flex-col gap-1 text-[12.5px] text-plomo">
                  Desde
                  <select #desde class="h-10 rounded-boton border border-borde bg-papel px-3 text-[14px] text-tinta">
                    @for (h of horas(a).inicios; track h) { <option [value]="h">{{ h }}</option> }
                  </select>
                </label>
                <label class="flex flex-1 flex-col gap-1 text-[12.5px] text-plomo">
                  Hasta
                  <select #hasta class="h-10 rounded-boton border border-borde bg-papel px-3 text-[14px] text-tinta">
                    @for (h of horas(a).fines; track h) { <option [value]="h">{{ h }}</option> }
                  </select>
                </label>
              </div>
              @if (error(); as mensaje) {
                <p class="text-[13px] text-ocupada" role="alert">{{ mensaje }}</p>
              }
              <ui-boton tipo="submit" variante="primario" [bloque]="true" [cargando]="enviando()">
                Reservar gratis (usa 1 de {{ a.cuposRestantes }})
              </ui-boton>
            </form>
          </ui-tarjeta>
        }
      </div>
    </div>
  `,
})
export class ReservarConAbono {
  private readonly abonos = inject(AbonoService);
  private readonly reservas = inject(ReservaService);
  private readonly vehiculosService = inject(VehiculoService);
  private readonly router = inject(Router);

  readonly abonoId = input.required<Id>();

  protected readonly turnos = TURNOS;
  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly misAbonos = rxResource({
    stream: () => this.abonos.misAbonos(),
    defaultValue: [] as Abono[],
  });

  protected readonly vehiculos = rxResource({
    stream: () => this.vehiculosService.listarMisVehiculos(),
    defaultValue: [] as Vehiculo[],
  });

  protected readonly abono = computed(() =>
    this.misAbonos.hasValue()
      ? (this.misAbonos.value().find((a) => a.id === this.abonoId() && a.estado === 'VIGENTE') ?? null)
      : null,
  );

  protected reintentar(): void {
    this.misAbonos.reload();
    this.vehiculos.reload();
  }

  /** Hoy o el primer dia del abono, lo que venga despues. */
  protected minimo(abono: Abono): string {
    const hoy = aFechaISO(new Date());
    return hoy > abono.desde ? hoy : abono.desde;
  }

  /**
   * Horas en punto dentro del turno. La noche termina a las 24, pero una
   * reserva no puede pasar la medianoche (ni el cierre, como mucho 23:59):
   * el ultimo fin que se ofrece es 23:00.
   */
  protected horas(abono: Abono): { inicios: HoraHHmm[]; fines: HoraHHmm[] } {
    const { desde, hasta } = TURNOS[abono.turno];
    const primera = Number(desde.slice(0, 2));
    const ultima = Math.min(Number(hasta.slice(0, 2)), 23);
    const rango = (de: number, a: number) =>
      Array.from({ length: a - de + 1 }, (_, i) => `${dosDigitos(de + i)}:00`);
    return { inicios: rango(primera, ultima - 1), fines: rango(primera + 1, ultima) };
  }

  protected confirmar(abono: Abono, vehiculoId: string, fecha: string, horaDesde: string, horaHasta: string): void {
    if (horaHasta <= horaDesde) {
      this.error.set('La hora de salida tiene que ser posterior a la de entrada.');
      return;
    }
    this.enviando.set(true);
    this.error.set(null);
    this.reservas
      .crearConAbono({ abonoId: abono.id, vehiculoId, fecha, horaDesde, horaHasta })
      .subscribe({
        next: () => void this.router.navigate(['/conductor/mis-reservas']),
        error: (e: Error) => {
          this.enviando.set(false);
          this.error.set(e.message);
        },
      });
  }
}
