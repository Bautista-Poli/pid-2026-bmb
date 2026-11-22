import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { RangoHorario, SelectorFranja } from './selector-franja/selector-franja';
import { ReservaConfirmada } from './reserva-confirmada/reserva-confirmada';
import { ResumenReserva } from './resumen-reserva/resumen-reserva';
import { SelectorDuracion } from './selector-duracion/selector-duracion';
import { SelectorFecha } from './selector-fecha/selector-fecha';
import { Boton, Cargando, EstadoVacio, Tarjeta } from '@app/components/ui';
import { SelectorVehiculo } from '@app/components/vehiculo';
import { Duracion, FechaISO, Id, Reserva, Vehiculo } from '@app/models';
import { EstacionamientoService } from '@app/services/estacionamiento.service';
import { ReservaService } from '@app/services/reserva.service';
import { resumenTarifas } from '@app/utils/tarifa.util';
import { formatearDistancia, resumenHorario } from '@app/utils/disponibilidad.util';
import { diaSemanaDe, hoyISO } from '@app/utils/fecha.util';

/** Con lo que arranca una reserva: 2 horas, cobradas por hora (selector-duracion la ajusta a las tarifas). */
const DURACION_INICIAL: Duracion = { horas: 2, modalidad: 'HORA' };

/**
 * Pantalla `/conductor/reservar/:estacionamientoId` · rol CONDUCTOR
 *
 * Flujo de reserva: vehiculo, fecha, cuantas horas y
 * hora de ingreso en una sola vista, con el resumen y la confirmacion al pie
 * (columna derecha sticky en desktop).
 *
 * Cada parte se arregla sola y deja un solo valor: el vehiculo, la fecha, la
 * duracion (horas y modalidad) y el horario. La pantalla los junta, muestra el
 * resumen y crea la reserva.
 */
@Component({
  selector: 'app-reservar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    SelectorVehiculo,
    SelectorFecha,
    SelectorFranja,
    SelectorDuracion,
    ResumenReserva,
    ReservaConfirmada,
    Tarjeta,
    Boton,
    Cargando,
    EstadoVacio,
  ],
  templateUrl: './reservar.html',
  styleUrl: './reservar.css',
})
export class Reservar {
  private readonly estacionamientos = inject(EstacionamientoService);
  private readonly reservas = inject(ReservaService);

  /** Llega del parametro de ruta `:estacionamientoId`. */
  readonly estacionamientoId = input.required<Id>();

  /* ------------------- Lo que elige el conductor en cada parte ------------------ */

  /** Vehiculo elegido (components/vehiculo/selector-vehiculo); `null` si no cargo ninguno. */
  protected readonly vehiculo = signal<Vehiculo | null>(null);
  /** Dia de la reserva (selector-fecha/). */
  protected readonly fecha = signal<FechaISO | null>(hoyISO());
  /** Cuantas horas y con que modalidad se cobran (selector-duracion/). */
  protected readonly duracion = signal<Duracion>(DURACION_INICIAL);
  /** Hora de ingreso y de salida (selector-franja/); `null` si no hay ninguna libre. */
  protected readonly rango = signal<RangoHorario | null>(null);

  protected readonly completo = computed(() => Boolean(this.vehiculo() && this.fecha() && this.rango()));

  /* --------------------------------- Pantalla -------------------------------- */

  protected readonly confirmando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly reservaConfirmada = signal<Reserva | null>(null);

  protected readonly recursoEstacionamiento = rxResource({
    params: () => this.estacionamientoId(),
    stream: ({ params }) => this.estacionamientos.obtener(params),
  });

  /** Para pedirle que vuelva a buscar los horarios si la reserva falla. */
  private readonly selectorFranja = viewChild(SelectorFranja);

  /** Despues de cargar su primer vehiculo, el conductor vuelve a esta reserva. */
  protected readonly rutaVolver = computed(() => `/conductor/reservar/${this.estacionamientoId()}`);

  /**
   * Deja clara la politica de cancelacion antes de reservar: mientras esta
   * pendiente se puede cancelar libre, la ventana de horas recien corre desde
   * que el propietario confirma (ver reserva.service.js: cancelar()).
   */
  protected readonly textoPolitica = computed(() => {
    const horas = this.recursoEstacionamiento.value()?.politicaCancelacionHoras;
    if (!horas) return 'Podés cancelar cuando quieras, incluso ya confirmada.';
    const texto = horas === 1 ? '1 hora' : `${horas} horas`;
    return `Podés cancelar sin problema mientras esté pendiente. Una vez que el propietario la confirme, tenés que cancelar con al menos ${texto} de anticipación.`;
  });

  /** Horario de atencion del dia elegido, para explicar por que no aparecen todas las horas. */
  protected readonly horarioAtencion = computed(() => {
    const estacionamiento = this.recursoEstacionamiento.value();
    const fecha = this.fecha();
    if (!estacionamiento || !fecha || estacionamiento.horarios.length === 0) return '';
    const horario = resumenHorario(estacionamiento.horarios, diaSemanaDe(fecha));
    return horario === 'Cerrado hoy' ? 'Cerrado ese día' : `Atiende ${horario}`;
  });

  /** Aclaracion debajo de las horas de ingreso, segun como se cobra. */
  protected readonly notaHorario = computed(() => {
    const { modalidad } = this.duracion();
    if (modalidad === 'HORA') return 'Por hora tenés que entrar y salir dentro del horario de atención.';
    const nombre = modalidad === 'ESTADIA' ? 'estadía' : 'jornada';
    return `La ${nombre} puede seguir después del cierre: solo tenés que entrar con el estacionamiento abierto.`;
  });

  /** "Av. Belgrano 1240 · 1,2 km · $ 900 por hora": direccion, distancia y resumen de tarifas. */
  protected readonly contexto = computed(() => {
    const estacionamiento = this.recursoEstacionamiento.value();
    if (!estacionamiento) return '';
    const { direccion, tarifas, distanciaKm } = estacionamiento;
    const distancia = formatearDistancia(distanciaKm);
    const base = `${direccion.calle} ${direccion.numero}`.trim();
    return `${base}${distancia ? ` · ${distancia}` : ''} · ${resumenTarifas(tarifas)}`;
  });

  constructor() {
    // Cada estacionamiento arranca su propia reserva, con hoy preseleccionado.
    // El vehiculo elegido se conserva.
    effect(() => {
      this.estacionamientoId();
      this.fecha.set(hoyISO());
      this.duracion.set(DURACION_INICIAL);
      this.rango.set(null);
      this.reservaConfirmada.set(null);
      this.error.set(null);
    });
  }

  /** `POST /api/reservas` */
  protected confirmar(): void {
    const vehiculo = this.vehiculo();
    const fecha = this.fecha();
    const rango = this.rango();
    if (!vehiculo || !fecha || !rango) return;
    const { modalidad } = this.duracion();

    this.confirmando.set(true);
    this.error.set(null);

    this.reservas
      .crear({
        estacionamientoId: this.estacionamientoId(),
        vehiculoId: vehiculo.id,
        modalidad,
        fecha,
        horaDesde: rango.horaDesde,
        // Estadia y jornada terminan solas (12 h / 24 h despues).
        horaHasta: modalidad === 'HORA' ? rango.horaHasta : null,
      })
      .subscribe({
        next: (reserva) => {
          this.confirmando.set(false);
          this.reservaConfirmada.set(reserva);
        },
        error: (e: Error) => {
          this.confirmando.set(false);
          // Caso tipico: la ultima cochera se ocupo mientras el usuario elegia.
          this.error.set(e.message);
          this.selectorFranja()?.recargar();
        },
      });
  }
}
