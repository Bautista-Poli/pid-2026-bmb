import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { CeldaCochera, LeyendaCocheras } from '@app/components/cochera';
import {
  Boton,
  Cargando,
  Chip,
  EstadoVacio,
  Etiqueta,
  Icono,
  NombreIcono,
  Tarjeta,
  TonoEtiqueta,
} from '@app/components/ui';
import {
  Cochera,
  Estacionamiento,
  EstadoCochera,
  EstadoReserva,
  ESTADOS_COCHERA_ORDEN,
  ETIQUETA_ESTADO_RESERVA,
  ETIQUETA_TIPO_VEHICULO,
  Id,
  ReservaDetallada,
  TipoVehiculo,
} from '@app/models';
import { AuthService } from '@app/services/auth.service';
import { avanzarReserva } from '@app/services/ciclo-reserva';
import { CocheraService } from '@app/services/cochera.service';
import { EstacionamientoService } from '@app/services/estacionamiento.service';
import { ReservaService } from '@app/services/reserva.service';
import { aFechaISO } from '@app/utils/fecha.util';

/** Tono de cada tarjeta de metrica: fondo del icono y color del trazo. */
type TonoMetrica = 'azul' | 'verde' | 'violeta';

const CLASE_TONO: Record<TonoMetrica, string> = {
  azul: 'bg-acento-suave text-acento',
  verde: 'bg-exito-suave text-exito',
  violeta: 'bg-violet-500/12 text-violet-500',
};

/** Comparacion contra ayer: flecha y color segun el signo. */
interface Variacion {
  sube: boolean | null;
  texto: string;
}

interface Metrica {
  etiqueta: string;
  valor: string;
  /** Parte chica del valor ("/ 40"). */
  complemento?: string;
  icono: NombreIcono;
  tono: TonoMetrica;
  variacion?: Variacion;
  detalle?: string;
}

interface DiaOcupacion {
  fecha: string;
  etiqueta: string;
  esHoy: boolean;
  ocupadas: number;
  libres: number;
}

const TONO_ESTADO: Record<EstadoReserva, TonoEtiqueta> = {
  PENDIENTE: 'aviso',
  CONFIRMADA: 'acento',
  ACTIVA: 'exito',
  FINALIZADA: 'neutro',
  CANCELADA: 'peligro',
};

const ICONO_VEHICULO: Record<TipoVehiculo, NombreIcono> = {
  AUTO: 'auto',
  CAMIONETA: 'camioneta',
  MOTO: 'moto',
};

const PASOS: Partial<Record<EstadoReserva, string>> = {
  PENDIENTE: 'Confirmar',
  CONFIRMADA: 'Ingreso',
  ACTIVA: 'Egreso',
};

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
    CeldaCochera,
    LeyendaCocheras,
    Tarjeta,
    Chip,
    Boton,
    Cargando,
    EstadoVacio,
    Etiqueta,
    Icono,
  ],
  templateUrl: './tablero.html',
})
export class Tablero {
  private readonly estacionamientos = inject(EstacionamientoService);
  private readonly cocheras = inject(CocheraService);
  private readonly reservas = inject(ReservaService);
  private readonly auth = inject(AuthService);

  protected readonly hoy = new Date();
  private readonly hoyISO = aFechaISO(this.hoy);
  private readonly ayerISO = aFechaISO(new Date(Date.now() - 86_400_000));

  protected readonly estados = ESTADOS_COCHERA_ORDEN;
  protected readonly etiquetaTipo = ETIQUETA_TIPO_VEHICULO;
  protected readonly etiquetaEstado = ETIQUETA_ESTADO_RESERVA;
  protected readonly tonoEstado = TONO_ESTADO;
  protected readonly iconoVehiculo = ICONO_VEHICULO;
  protected readonly pasos = PASOS;
  protected readonly claseTono = CLASE_TONO;

  protected readonly nombre = computed(() => this.auth.usuario()?.nombre ?? '');

  protected readonly seleccionadoId = signal<Id | null>(null);
  protected readonly cocheraAbierta = signal<Cochera | null>(null);

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

  private readonly vigentes = computed(() =>
    this.recursoReservas.value().filter((r) => r.estado !== 'CANCELADA'),
  );

  private readonly delDia = (fecha: string) => this.vigentes().filter((r) => r.fecha === fecha);

  /** Reservas de hoy (incluye canceladas para mostrarlas en la lista), por hora. */
  protected readonly reservasHoy = computed(() =>
    this.recursoReservas
      .value()
      .filter((r) => r.fecha === this.hoyISO)
      .sort((a, b) => a.horaDesde.localeCompare(b.horaDesde)),
  );

  private readonly totales = computed(() => {
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

  /** Escala del eje Y: 4 tramos redondos que cubren el total de cocheras. */
  protected readonly escala = computed(() => {
    const total = Math.max(this.totales().cocheras, 1);
    const tramo = total / 4;
    const paso = tramo <= 5 ? Math.ceil(tramo) : Math.ceil(tramo / 5) * 5;
    const tope = paso * 4;
    return { tope, marcas: [4, 3, 2, 1, 0].map((n) => n * paso) };
  });

  protected alto(valor: number): string {
    return `${(valor / this.escala().tope) * 100}%`;
  }

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

  protected readonly actualizadoEn = computed(() => {
    this.recursoCocheras.value();
    return new Date();
  });

  protected readonly procesandoId = signal<Id | null>(null);
  protected readonly error = signal<string | null>(null);

  protected seleccionar(id: Id): void {
    this.seleccionadoId.set(id);
    this.cocheraAbierta.set(null);
  }

  protected abrir(cochera: Cochera): void {
    this.cocheraAbierta.update((actual) => (actual?.id === cochera.id ? null : cochera));
  }

  /** Ciclo de la reserva desde el panel: mismos pasos que "Reservas". */
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

  /** `PATCH /api/estacionamientos/:id/cocheras/:idCochera` y refresco. */
  protected cambiarEstado(cochera: Cochera, estado: EstadoCochera): void {
    this.cocheras.cambiarEstado(cochera, estado).subscribe({
      next: () => {
        this.cocheraAbierta.set(null);
        this.recursoCocheras.reload();
        this.recursoEstacionamientos.reload();
      },
    });
  }

  private diferencia(hoy: number, ayer: number): Variacion {
    const delta = hoy - ayer;
    if (delta === 0) return { sube: null, texto: 'igual que ayer' };
    return { sube: delta > 0, texto: `${Math.abs(delta)} vs. ayer` };
  }

  private porcentaje(hoy: number, ayer: number): Variacion {
    if (ayer === 0) {
      return hoy === 0 ? { sube: null, texto: 'igual que ayer' } : { sube: true, texto: 'sin ingresos ayer' };
    }
    const delta = Math.round(((hoy - ayer) / ayer) * 100);
    if (delta === 0) return { sube: null, texto: 'igual que ayer' };
    return { sube: delta > 0, texto: `${Math.abs(delta)}% vs. ayer` };
  }
}
