import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, OnInit, signal } from '@angular/core';
import { EstadoReserva } from '@app/components/reserva';
import { EstadoVacio, Icono } from '@app/components/ui';
import { direccionCorta, Id, ReservaDetallada } from '@app/models';
import { finDe, inicioDe } from '@app/services/ciclo-reserva';
import { desdeFechaISO } from '@app/utils/fecha.util';
import { DetalleReserva } from '../partes-tarjeta/detalle-reserva/detalle-reserva';
import { partesDeFecha } from '../partes-tarjeta/fecha-reserva/fecha-reserva';
import { VerQr } from '../partes-tarjeta/ver-qr/ver-qr';

/** El reloj se refresca cada 30 s: alcanza para los minutos. */
const REFRESCO_MS = 30_000;
const UN_DIA_MS = 86_400_000;

/** "1 h 25 min", "45 min", "2 h". */
function duracion(ms: number): string {
  const minutos = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/**
 * Pestaña "En curso" de Mis reservas: una tarjeta por cada reserva en la que
 * el conductor ya ingreso al estacionamiento. Arriba cuanto lleva, cuanto
 * falta y la barra de progreso de la franja; abajo el estacionamiento y el
 * resto (auto, cochera, como llegar y precio), que lo pone detalle-reserva,
 * con el QR para salir.
 *
 * Tiene su propio reloj, que se refresca cada 30 s.
 */
@Component({
  selector: 'app-reservas-en-curso',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EstadoVacio, Icono, EstadoReserva, DetalleReserva, VerQr],
  templateUrl: './reservas-en-curso.html',
  styleUrl: './reservas-en-curso.css',
})
export class ReservasEnCurso implements OnInit {
  private readonly destroyRef = inject(DestroyRef);

  /** Reservas con el ingreso ya registrado (estado ACTIVA). */
  readonly reservas = input.required<ReservaDetallada[]>();

  private readonly ahora = signal(Date.now());

  ngOnInit(): void {
    const reloj = setInterval(() => this.ahora.set(Date.now()), REFRESCO_MS);
    this.destroyRef.onDestroy(() => clearInterval(reloj));
  }

  protected readonly direccion = (reserva: ReservaDetallada) => direccionCorta(reserva.estacionamiento.direccion);

  /** "Hoy · lun 28 sep", "Mañana · mar 29 sep" o "vie 3 oct". */
  protected fechaLarga(reserva: ReservaDetallada): string {
    const { semana, numero, mes } = partesDeFecha(reserva.fecha);
    const fecha = `${semana} ${numero} ${mes}`;

    const hoy = new Date(this.ahora());
    hoy.setHours(0, 0, 0, 0);
    const dias = Math.round((desdeFechaISO(reserva.fecha).getTime() - hoy.getTime()) / UN_DIA_MS);
    if (dias === 0) return `Hoy · ${fecha}`;
    if (dias === 1) return `Mañana · ${fecha}`;
    return fecha;
  }

  /** Cuanto lleva: desde el ingreso real si el propietario lo registro; si no, desde la franja. */
  protected lleva(reserva: ReservaDetallada): string {
    const desde = reserva.ingresoEn ? Date.parse(reserva.ingresoEn) : inicioDe(reserva);
    return duracion(this.ahora() - desde);
  }

  protected falta(reserva: ReservaDetallada): string {
    const restante = finDe(reserva) - this.ahora();
    return restante > 0 ? `faltan ${duracion(restante)}` : 'ya terminó el horario';
  }

  /** Cuanto de la franja ya paso, de 0 a 100. */
  protected progreso(reserva: ReservaDetallada): number {
    const total = finDe(reserva) - inicioDe(reserva);
    if (total <= 0) return 100;
    const avance = (this.ahora() - inicioDe(reserva)) / total;
    return Math.round(Math.min(1, Math.max(0, avance)) * 100);
  }
}
