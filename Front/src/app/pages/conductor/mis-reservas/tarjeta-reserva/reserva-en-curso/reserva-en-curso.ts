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
import { ReservaDetallada } from '@app/models';
import { aInstante, desdeFechaISO } from '@app/utils/fecha.util';

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
 * Bloque de arriba de la tarjeta de una reserva en curso (tarjeta-reserva.ts):
 * cuanto lleva, cuanto falta y la barra de progreso de la franja. Tiene su
 * propio reloj, que se refresca cada 30 s.
 */
@Component({
  selector: 'app-reserva-en-curso',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reserva-en-curso.html',
  host: { class: 'block' },
})
export class ReservaEnCurso implements OnInit {
  private readonly destroyRef = inject(DestroyRef);

  readonly reserva = input.required<ReservaDetallada>();
  /** "lun 28 sep": la fecha como la muestra la tarjeta. */
  readonly fecha = input.required<string>();

  private readonly ahora = signal(Date.now());

  /** "Hoy · lun 28 sep", "Mañana · mar 29 sep" o "vie 3 oct". */
  protected readonly fechaLarga = computed(() => {
    const hoy = new Date(this.ahora());
    hoy.setHours(0, 0, 0, 0);
    const dia = desdeFechaISO(this.reserva().fecha);
    const dias = Math.round((dia.getTime() - hoy.getTime()) / 86_400_000);
    if (dias === 0) return `Hoy · ${this.fecha()}`;
    if (dias === 1) return `Mañana · ${this.fecha()}`;
    return this.fecha();
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
    return ;
  });

  // vamos a hacer una prueba basica cambiando la fecha final al tocar una vez el boton, luego vemos formato de fecha
  private readonly extender = signal(false);

  protected readonly extension = computed(() => {
    return this.extender.set(true);
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
