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
  templateUrl: './reservar-con-abono.html',
  styleUrl: './reservar-con-abono.css',
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
