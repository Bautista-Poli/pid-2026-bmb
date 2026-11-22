import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  OnInit,
  signal,
} from '@angular/core';
import { EstadoReserva } from '@app/components/reserva';
import { Icono } from '@app/components/ui';
import { direccionCorta, ReservaDetallada } from '@app/models';
import { aInstante, desdeFechaISO } from '@app/utils/fecha.util';
import { AvisoReasignacion } from '../../partes-tarjeta/aviso-reasignacion';
import { partesDeFecha } from '../../partes-tarjeta/fecha-reserva';
import { ComoLlegar } from '../partes-tarjeta/como-llegar';
import { PrecioReserva } from '../partes-tarjeta/precio-reserva';
import { VehiculoYCochera } from '../partes-tarjeta/vehiculo-y-cochera';
import { VerQr } from '../ver-qr/ver-qr';

/** El reloj de la reserva en curso se refresca cada 30 s: alcanza para los minutos. */
const REFRESCO_MS = 30_000;

/** "1 h 25 min", "45 min", "2 h". */
function duracion(ms: number): string {
  const minutos = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/**
 * Tarjeta de la reserva en curso del conductor: arriba cuanto lleva, cuanto
 * falta y la barra de progreso de la franja; abajo el estacionamiento, el
 * auto, la cochera y el QR para salir. Tiene su propio reloj, que se refresca
 * cada 30 s.
 */
@Component({
  selector: 'app-tarjeta-en-curso',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icono, EstadoReserva, AvisoReasignacion, VehiculoYCochera, ComoLlegar, PrecioReserva, VerQr],
  templateUrl: './tarjeta-en-curso.html',
  host: { class: 'block' },
})
export class TarjetaEnCurso implements OnInit {
  private readonly destroyRef = inject(DestroyRef);

  readonly reserva = input.required<ReservaDetallada>();

  private readonly ahora = signal(Date.now());

  protected readonly direccion = computed(() =>
    direccionCorta(this.reserva().estacionamiento.direccion),
  );

  /** "Hoy · lun 28 sep", "Mañana · mar 29 sep" o "vie 3 oct". */
  protected readonly fechaLarga = computed(() => {
    const { semana, numero, mes } = partesDeFecha(this.reserva().fecha);
    const fecha = `${semana} ${numero} ${mes}`;

    const hoy = new Date(this.ahora());
    hoy.setHours(0, 0, 0, 0);
    const dia = desdeFechaISO(this.reserva().fecha);
    const dias = Math.round((dia.getTime() - hoy.getTime()) / 86_400_000);
    if (dias === 0) return `Hoy · ${fecha}`;
    if (dias === 1) return `Mañana · ${fecha}`;
    return fecha;
  });

  private readonly inicio = computed(() =>
    Date.parse(aInstante(this.reserva().fecha, this.reserva().horaDesde)),
  );
  private readonly fin = computed(() =>
    Date.parse(aInstante(this.reserva().fechaHasta, this.reserva().horaHasta)),
  );

  /** Desde el ingreso real si el propietario lo registro; si no, desde la franja. */
  protected readonly lleva = computed(() => {
    const ingreso = this.reserva().ingresoEn;
    const desde = ingreso ? Date.parse(ingreso) : this.inicio();
    return duracion(this.ahora() - desde);
  });

  protected readonly falta = computed(() => {
    const restante = this.fin() - this.ahora();
    return restante > 0 ? `faltan ${duracion(restante)}` : 'ya terminó el horario';
  });

  protected readonly progreso = computed(() => {
    const total = this.fin() - this.inicio();
    if (total <= 0) return 100;
    const avance = (this.ahora() - this.inicio()) / total;
    return Math.round(Math.min(1, Math.max(0, avance)) * 100);
  });

  ngOnInit(): void {
    const reloj = setInterval(() => this.ahora.set(Date.now()), REFRESCO_MS);
    this.destroyRef.onDestroy(() => clearInterval(reloj));
  }
}
