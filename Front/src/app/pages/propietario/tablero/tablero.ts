import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { EstadoCocheras } from './estado-cocheras/estado-cocheras';
import { IngresarCodigo } from './ingresar-codigo/ingresar-codigo';
import { DiaOcupacion, OcupacionSemana } from './ocupacion-semana/ocupacion-semana';
import { ReservasHoy } from './reservas-hoy/reservas-hoy';
import { Metrica, TarjetaMetrica, Variacion } from './tarjeta-metrica/tarjeta-metrica';
import { Boton, Cargando, EstadoVacio, Icono } from '@app/components/ui';
import { Cochera, Estacionamiento, Id, ReservaDetallada } from '@app/models';
import { AuthService } from '@app/services/auth.service';
import { avanzarReserva } from '@app/services/ciclo-reserva';
import { CocheraService } from '@app/services/propietario/cochera.service';
import { EstacionamientoService } from '@app/services/estacionamiento.service';
import { ReservaService } from '@app/services/reserva.service';
import { aFechaISO, hoyISO } from '@app/utils/fecha.util';

const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

const pesos = (monto: number) => `$ ${monto.toLocaleString('es-AR')}`;

/**
 * Pantalla `/propietario/tablero` · rol PROPIETARIO
 *
 * Inicio del propietario: metricas del dia de todos sus estacionamientos,
 * ocupacion de la semana, reservas de hoy y el estado de cada cochera.
 */
@Component({
  selector: 'app-tablero',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    RouterLink,
    TarjetaMetrica,
    OcupacionSemana,
    ReservasHoy,
    EstadoCocheras,
    IngresarCodigo,
    Boton,
    Cargando,
    EstadoVacio,
    Icono,
  ],
  templateUrl: './tablero.html',
  styleUrls: ['./compartido.css', './tablero.css'],
})
export class Tablero {
  private readonly estacionamientos = inject(EstacionamientoService);
  private readonly cocheras = inject(CocheraService);
  private readonly reservas = inject(ReservaService);
  private readonly auth = inject(AuthService);

  protected readonly hoy = new Date();
  private readonly hoyISO = hoyISO();
  private readonly ayerISO = hoyISO(new Date(Date.now() - 86_400_000));

  protected readonly nombre = computed(() => this.auth.usuario()?.nombre ?? '');

  protected readonly seleccionadoId = signal<Id | null>(null);

  protected readonly recursoEstacionamientos = rxResource({
    params: () => this.auth.usuario()?.id,
    stream: () => this.estacionamientos.listarDelPropietario(),
    defaultValue: [] as Estacionamiento[],
  });

  /** Todas las reservas de todos los estacionamientos: de aca salen metricas y grafico. */
  protected readonly recursoReservas = rxResource({
    params: () => ({ ids: this.recursoEstacionamientos.value().map((e) => e.id) }),
    stream: ({ params }) => this.reservas.listarDeEstacionamientos(params.ids),
    defaultValue: [] as ReservaDetallada[],
  });

  /** Las que ocuparon (u ocupan) una cochera: sin canceladas ni no-shows, que no se cobran. */
  private readonly vigentes = computed(() =>
    this.recursoReservas.value().filter((r) => r.estado !== 'CANCELADA' && r.estado !== 'NO_SHOW'),
  );

  private readonly delDia = (fecha: string) => this.vigentes().filter((r) => r.fecha === fecha);

  /** Reservas de hoy (incluye canceladas para mostrarlas en la lista), por hora. */
  protected readonly reservasHoy = computed(() =>
    this.recursoReservas
      .value()
      .filter((r) => r.fecha === this.hoyISO)
      .sort((a, b) => a.horaDesde.localeCompare(b.horaDesde)),
  );

  protected readonly totales = computed(() => {
    const lista = this.recursoEstacionamientos.value().filter((e) => e.activo);
    return {
      cocheras: lista.reduce((suma, e) => suma + e.cocherasTotales, 0),
      libres: lista.reduce((suma, e) => suma + e.cocherasDisponibles, 0),
    };
  });

  protected readonly metricas = computed<Metrica[]>(() => {
    const cargando = this.recursoReservas.isLoading();
    const lotes = this.recursoEstacionamientos.value();
    const { cocheras, libres } = this.totales();

    const hoy = this.delDia(this.hoyISO);
    const ayer = this.delDia(this.ayerISO);
    const ingresosHoy = hoy.reduce((t, r) => t + r.precioTotal, 0);
    const ingresosAyer = ayer.reduce((t, r) => t + r.precioTotal, 0);

    return [
      {
        etiqueta: 'Cocheras disponibles',
        valor: String(libres),
        complemento: `/ ${cocheras}`,
        icono: 'auto',
        tono: 'azul',
        detalle: `${cocheras - libres} ocupadas ahora`,
      },
      {
        etiqueta: 'Reservas de hoy',
        valor: cargando ? '—' : String(hoy.length),
        icono: 'calendario',
        tono: 'azul',
        variacion: cargando ? undefined : this.diferencia(hoy.length, ayer.length),
      },
      {
        etiqueta: 'Ingresos de hoy',
        valor: cargando ? '—' : pesos(ingresosHoy),
        icono: 'moneda',
        tono: 'verde',
        variacion: cargando ? undefined : this.porcentaje(ingresosHoy, ingresosAyer),
      },
      {
        etiqueta: 'Estacionamientos',
        valor: String(lotes.length),
        icono: 'edificio',
        tono: 'violeta',
        detalle: `${lotes.filter((e) => e.activo && e.publicado).length} publicados`,
      },
    ];
  });

  /**
   * Ocupacion de la semana actual (lunes a domingo): cocheras con al menos una
   * reserva vigente cada dia, sobre el total de cocheras activas.
   */
  protected readonly semana = computed<DiaOcupacion[]>(() => {
    const total = this.totales().cocheras;
    const lunes = new Date(this.hoy);
    lunes.setDate(this.hoy.getDate() - ((this.hoy.getDay() + 6) % 7));

    return Array.from({ length: 7 }, (_, i) => {
      const dia = new Date(lunes);
      dia.setDate(lunes.getDate() + i);
      const fecha = aFechaISO(dia);
      const cocheras = new Set(this.delDia(fecha).map((r) => r.cocheraId ?? r.id));
      const ocupadas = Math.min(cocheras.size, total);
      return {
        fecha,
        etiqueta: `${DIAS_CORTOS[dia.getDay()]} ${dia.getDate()}`,
        esHoy: fecha === this.hoyISO,
        ocupadas,
        libres: total - ocupadas,
      };
    });
  });

  /* --------------------------- estado de cocheras -------------------------- */

  /** Estacionamiento de la cuadricula: el elegido, o el primero. */
  protected readonly activo = computed<Estacionamiento | null>(() => {
    const lista = this.recursoEstacionamientos.value();
    return lista.find((e) => e.id === this.seleccionadoId()) ?? lista[0] ?? null;
  });

  protected readonly recursoCocheras = rxResource({
    params: () => this.activo()?.id,
    stream: ({ params }) => this.cocheras.listarPorEstacionamiento(params),
    defaultValue: [] as Cochera[],
  });

  protected readonly procesandoId = signal<Id | null>(null);
  protected readonly error = signal<string | null>(null);

  /** Confirmar una pendiente desde el panel; ingreso y egreso solo con el codigo. */
  protected avanzar(reserva: ReservaDetallada): void {
    const paso = avanzarReserva(this.reservas, reserva);
    if (!paso) return;

    this.procesandoId.set(reserva.id);
    this.error.set(null);

    paso.llamada.subscribe({
      next: () => {
        this.procesandoId.set(null);
        this.recursoReservas.reload();
        this.recursoCocheras.reload();
        this.recursoEstacionamientos.reload();
      },
      error: (e: Error) => {
        this.procesandoId.set(null);
        this.error.set(e.message);
      },
    });
  }

  private diferencia(hoy: number, ayer: number): Variacion {
    const delta = hoy - ayer;
    if (delta === 0) return { sube: null, texto: 'igual que ayer' };
    return { sube: delta > 0, texto: `${Math.abs(delta)} vs. ayer` };
  }

  /** Variacion de hoy contra ayer ("12% vs. ayer"). */
  private porcentaje(hoy: number, ayer: number): Variacion {
    if (ayer === 0) {
      return hoy === 0 ? { sube: null, texto: 'igual que ayer' } : { sube: true, texto: 'sin ingresos ayer' };
    }
    const delta = Math.round(((hoy - ayer) / ayer) * 100);
    if (delta === 0) return { sube: null, texto: 'igual que ayer' };
    return { sube: delta > 0, texto: `${Math.abs(delta)}% vs. ayer` };
  }
}
