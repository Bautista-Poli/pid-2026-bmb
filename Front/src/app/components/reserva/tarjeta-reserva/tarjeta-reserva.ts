import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Etiqueta, Icono, TonoEtiqueta } from '@app/components/ui';
import { ChapaPatente } from '@app/components/vehiculo';
import {
  EstadoReserva,
  ETIQUETA_ESTADO_RESERVA,
  ETIQUETA_MODALIDAD,
  ETIQUETA_TIPO_VEHICULO,
  direccionCorta,
  ReservaDetallada,
} from '@app/models';
import { reservaEnJuego } from '@app/services/ciclo-reserva';
import { aInstante, desdeFechaISO } from '@app/utils/fecha.util';
import { linksComoLlegar } from '@app/utils/mapas.util';

const TONO_ESTADO: Record<EstadoReserva, TonoEtiqueta> = {
  PENDIENTE: 'aviso',
  CONFIRMADA: 'acento',
  ACTIVA: 'exito',
  FINALIZADA: 'neutro',
  CANCELADA: 'peligro',
};

/** El reloj de la reserva en curso se refresca cada 30 s: alcanza para los minutos. */
const REFRESCO_MS = 30_000;

const DIA_SEMANA = new Intl.DateTimeFormat('es-AR', { weekday: 'short' });
const MES = new Intl.DateTimeFormat('es-AR', { month: 'short' });

/** "sept." -> "sept": sin el punto de la abreviatura, que ensucia los bloques de fecha. */
const abreviar = (formato: Intl.DateTimeFormat, fecha: Date) =>
  formato.format(fecha).replace('.', '');

/** "1 h 25 min", "45 min", "2 h". */
function duracion(ms: number): string {
  const minutos = Math.max(0, Math.round(ms / 60_000));
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/**
 * Tarjeta de una reserva del conductor.
 *
 *   completa  -> la de "Vigentes". Si la reserva esta en curso, suma arriba el
 *                bloque con el tiempo que lleva y la barra de progreso.
 *   compacta  -> la del historial: una linea con fecha, lugar, precio y estado.
 */
@Component({
  selector: 'app-tarjeta-reserva',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, Etiqueta, Icono, ChapaPatente],
  templateUrl: './tarjeta-reserva.html',
  host: { class: 'block' },
})
export class TarjetaReserva implements OnInit {
  private readonly destroyRef = inject(DestroyRef);

  readonly reserva = input.required<ReservaDetallada>();
  readonly variante = input<'completa' | 'compacta'>('completa');
  readonly cancelando = input(false);

  readonly cancelar = output<ReservaDetallada>();

  protected readonly etiquetaEstado = ETIQUETA_ESTADO_RESERVA;
  protected readonly etiquetaModalidad = ETIQUETA_MODALIDAD;

  protected readonly ahora = signal(Date.now());

  protected readonly tono = computed(() => TONO_ESTADO[this.reserva().estado]);
  protected readonly enCurso = computed(
    () => this.variante() === 'completa' && this.reserva().estado === 'ACTIVA',
  );

  /** La tarjeta en curso respira un poco mas a los costados, como el bloque de arriba. */
  protected readonly margen = computed(() => (this.enCurso() ? 'px-5 lg:px-6' : 'px-4 lg:px-5'));

  /** El conductor no puede cancelar una reserva que ya arranco ni una que ya paso. */
  protected readonly cancelable = computed(
    () => reservaEnJuego(this.reserva()) && this.reserva().estado !== 'ACTIVA',
  );

  protected readonly vehiculo = computed(() => {
    const { marca, modelo, tipo } = this.reserva().vehiculo;
    const nombre = [marca, modelo].filter(Boolean).join(' ');
    return [nombre, ETIQUETA_TIPO_VEHICULO[tipo]].filter(Boolean).join(' · ');
  });

  protected readonly direccion = computed(() =>
    direccionCorta(this.reserva().estacionamiento.direccion),
  );

  protected readonly comoLlegar = computed(() =>
    linksComoLlegar(this.reserva().estacionamiento.direccion),
  );

  protected readonly cruzaMedianoche = computed(
    () => this.reserva().fechaHasta !== this.reserva().fecha,
  );

  /* ------------------------------ Fecha ------------------------------ */

  private readonly dia = computed(() => desdeFechaISO(this.reserva().fecha));

  protected readonly bloqueFecha = computed(() => ({
    semana: abreviar(DIA_SEMANA, this.dia()),
    numero: this.dia().getDate(),
    mes: abreviar(MES, this.dia()),
  }));

  /** "Hoy · lun 28 sep", "Mañana · mar 29 sep" o "vie 3 oct". */
  protected readonly fechaLarga = computed(() => {
    const { semana, numero, mes } = this.bloqueFecha();
    const texto = `${semana} ${numero} ${mes}`;
    const hoy = new Date(this.ahora());
    hoy.setHours(0, 0, 0, 0);
    const dias = Math.round((this.dia().getTime() - hoy.getTime()) / 86_400_000);
    if (dias === 0) return `Hoy · ${texto}`;
    if (dias === 1) return `Mañana · ${texto}`;
    return texto;
  });

  /* --------------------------- En curso --------------------------- */

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
    if (!this.enCurso()) return;
    const reloj = setInterval(() => this.ahora.set(Date.now()), REFRESCO_MS);
    this.destroyRef.onDestroy(() => clearInterval(reloj));
  }
}
