import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import {
  RangoHorario,
  ResumenReserva,
  SelectorDuracion,
  SelectorFecha,
  SelectorFranja,
  SelectorVehiculo,
} from '@app/components/reserva';
import { Boton, Cargando, EstadoVacio, Tarjeta } from '@app/components/ui';
import { ETIQUETA_MODALIDAD, FranjaDisponible, Id, Reserva, Vehiculo } from '@app/models';
import { EstacionamientoService } from '@app/services/estacionamiento.service';
import { ReservaService } from '@app/services/reserva.service';
import { VehiculoService } from '@app/services/vehiculo.service';
import { calcularPrecio, horasReservables, modalidadPorHoras, resumenTarifas } from '@app/utils/tarifa.util';
import { formatearDistancia, resumenHorario } from '@app/utils/disponibilidad.util';
import { aFechaISO, desdeFechaISO, diaSemanaDe } from '@app/utils/fecha.util';

/**
 * Pantalla `/conductor/reservar/:estacionamientoId` · rol CONDUCTOR
 *
 * Flujo de reserva: foto del estacionamiento, vehiculo, fecha, cuantas horas y
 * hora de ingreso en una sola vista, con el resumen y la confirmacion al pie
 * (columna derecha sticky en desktop).
 *
 * La modalidad sale de las horas: 12 h se cobra como estadia y 24 h como
 * jornada si el estacionamiento tiene esas tarifas; el resto, por hora.
 */
@Component({
  selector: 'app-reservar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    RouterLink,
    SelectorVehiculo,
    SelectorFecha,
    SelectorFranja,
    SelectorDuracion,
    ResumenReserva,
    Tarjeta,
    Boton,
    Cargando,
    EstadoVacio,
  ],
  templateUrl: './reservar.html',
})
export class Reservar {
  private readonly estacionamientos = inject(EstacionamientoService);
  private readonly vehiculos = inject(VehiculoService);
  private readonly reservas = inject(ReservaService);
  private readonly router = inject(Router);

  /** Llega del parametro de ruta `:estacionamientoId`. */
  readonly estacionamientoId = input.required<Id>();

  protected readonly desdeFechaISO = desdeFechaISO;
  protected readonly borrador = this.reservas.borrador;
  protected readonly horas = this.reservas.duracionHoras;
  protected readonly completo = this.reservas.borradorCompleto;

  protected readonly confirmando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly reservaConfirmada = signal<Reserva | null>(null);

  protected readonly recursoEstacionamiento = rxResource({
    params: () => this.estacionamientoId(),
    stream: ({ params }) => this.estacionamientos.obtener(params),
  });

  protected readonly recursoVehiculos = rxResource({
    stream: () => this.vehiculos.listarMisVehiculos(),
    defaultValue: [] as Vehiculo[],
  });

  protected readonly vehiculoElegido = computed(
    () => this.recursoVehiculos.value().find((v) => v.id === this.borrador().vehiculoId) ?? null,
  );

  /**
   * Los ingresos posibles dependen del tipo de vehiculo y de cuantas horas se
   * quieren: se piden con fecha, vehiculo y horas elegidos.
   */
  protected readonly recursoDisponibilidad = rxResource({
    params: () => {
      const { fecha, modalidad, horas } = this.borrador();
      const tipoVehiculo = this.vehiculoElegido()?.tipo;
      return fecha && tipoVehiculo
        ? {
            estacionamientoId: this.estacionamientoId(),
            fecha,
            tipoVehiculo,
            modalidad,
            horas: modalidad === 'HORA' ? horas : undefined,
          }
        : undefined;
    },
    stream: ({ params }) => this.reservas.disponibilidad(params),
    defaultValue: [] as FranjaDisponible[],
  });

  protected readonly total = computed(() => {
    const estacionamiento = this.recursoEstacionamiento.value();
    return estacionamiento ? this.reservas.precioEstimado(estacionamiento.tarifas) : 0;
  });

  /** "$900 por hora", "Estadía · 12 h" o "Jornada · 24 h". */
  protected readonly textoTarifa = computed(() => {
    const estacionamiento = this.recursoEstacionamiento.value();
    if (!estacionamiento) return null;
    const { modalidad } = this.borrador();
    const { hora } = estacionamiento.tarifas;
    if (modalidad !== 'HORA') return ETIQUETA_MODALIDAD[modalidad];
    return hora !== null ? `$${hora.toLocaleString('es-AR')} por hora` : null;
  });

  /** Con estadia o jornada: cuanto se ahorra frente a pagar esas horas por hora. */
  protected readonly textoAhorro = computed(() => {
    const estacionamiento = this.recursoEstacionamiento.value();
    const { modalidad, horas } = this.borrador();
    if (!estacionamiento || modalidad === 'HORA' || estacionamiento.tarifas.hora === null) return null;
    const ahorro = calcularPrecio('HORA', estacionamiento.tarifas, horas) - this.total();
    return ahorro > 0 ? `Ahorrás $${ahorro.toLocaleString('es-AR')} frente a pagar por hora` : null;
  });

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
    const fecha = this.borrador().fecha;
    if (!estacionamiento || !fecha || estacionamiento.horarios.length === 0) return '';
    const horario = resumenHorario(estacionamiento.horarios, diaSemanaDe(fecha));
    return horario === 'Cerrado hoy' ? 'Cerrado ese día' : `Atiende ${horario}`;
  });

  /** Hay ingresos para mostrar (disponibles o sin lugar) en el dia y la duracion elegidos. */
  protected readonly hayIngresos = computed(() =>
    this.recursoDisponibilidad.value().some((f) => f.disponible || f.causa === 'SIN_LUGAR'),
  );

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
    // Cada estacionamiento arranca su propio borrador, con hoy preseleccionado.
    effect(() => {
      const id = this.estacionamientoId();
      this.reservas.iniciarBorrador(id);
      this.reservas.actualizarBorrador({ fecha: aFechaISO(new Date()) });
      this.reservaConfirmada.set(null);
      this.error.set(null);
    });

    // Al llegar los ingresos: se mantiene la hora elegida si sigue libre (con la
    // salida de la nueva duracion); si no, queda propuesta la primera libre.
    effect(() => {
      const franjas = this.recursoDisponibilidad.value();
      if (this.recursoDisponibilidad.isLoading()) return;
      const { horaDesde, horaHasta } = untracked(this.borrador);
      const actual = franjas.find((f) => f.disponible && f.horaDesde === horaDesde);
      const elegida = actual ?? franjas.find((f) => f.disponible);
      const cambios = elegida
        ? { horaDesde: elegida.horaDesde, horaHasta: elegida.horaHasta }
        : { horaDesde: null, horaHasta: null };
      if (cambios.horaDesde !== horaDesde || cambios.horaHasta !== horaHasta) {
        this.reservas.actualizarBorrador(cambios);
      }
    });

    // El vehiculo predeterminado del conductor queda elegido de entrada.
    effect(() => {
      const vehiculos = this.recursoVehiculos.value();
      if (vehiculos.length === 0 || this.borrador().vehiculoId) return;
      const predeterminado = vehiculos.find((v) => v.predeterminado) ?? vehiculos[0];
      this.reservas.actualizarBorrador({ vehiculoId: predeterminado.id });
    });

    // Si las horas elegidas no se pueden reservar aca (p. ej. no cobra por
    // hora), se pasa a la primera cantidad que si; la modalidad sale de las horas.
    effect(() => {
      const estacionamiento = this.recursoEstacionamiento.value();
      if (!estacionamiento) return;
      const { horas, modalidad } = this.borrador();
      const posibles = horasReservables(estacionamiento.tarifas);
      if (posibles.length === 0) return;
      const validas = posibles.includes(horas) ? horas : posibles[0];
      const nuevaModalidad = modalidadPorHoras(validas, estacionamiento.tarifas)!;
      if (validas !== horas || nuevaModalidad !== modalidad) {
        this.reservas.actualizarBorrador({ horas: validas, modalidad: nuevaModalidad });
      }
    });
  }

  /** Cambiar de vehiculo, fecha u horas cambia los ingresos libres: se recalculan al llegar. */
  protected elegirVehiculo(vehiculoId: Id | null): void {
    this.reservas.actualizarBorrador({ vehiculoId });
  }

  protected elegirFecha(fecha: string | null): void {
    this.reservas.actualizarBorrador({ fecha });
  }

  protected elegirHoras(horas: number): void {
    const estacionamiento = this.recursoEstacionamiento.value();
    if (!estacionamiento) return;
    const modalidad = modalidadPorHoras(horas, estacionamiento.tarifas);
    if (modalidad) this.reservas.actualizarBorrador({ horas, modalidad });
  }

  protected elegirRango(rango: RangoHorario): void {
    this.reservas.actualizarBorrador(rango);
  }

  /** `POST /api/reservas` */
  protected confirmar(): void {
    const payload = this.reservas.aPayload();
    if (!payload) return;

    this.confirmando.set(true);
    this.error.set(null);

    this.reservas.crear(payload).subscribe({
      next: (reserva) => {
        this.confirmando.set(false);
        this.reservaConfirmada.set(reserva);
        this.reservas.reiniciarBorrador();
      },
      error: (e: Error) => {
        this.confirmando.set(false);
        // Caso tipico: la ultima cochera se ocupo mientras el usuario elegia.
        this.error.set(e.message);
        this.recursoDisponibilidad.reload();
      },
    });
  }

  protected irAMisReservas(): void {
    void this.router.navigate(['/conductor/mis-reservas']);
  }
}
