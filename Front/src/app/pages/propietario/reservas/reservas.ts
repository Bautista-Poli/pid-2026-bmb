import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import {
  Cargando,
  EstadoVacio,
  Etiqueta,
  Icono,
  NombreIcono,
  Tarjeta,
  TonoEtiqueta,
} from '@app/components/ui';
import {
  EstadoReserva,
  Estacionamiento,
  ETIQUETA_ESTADO_RESERVA,
  ETIQUETA_TIPO_VEHICULO,
  Id,
  ReservaDetallada,
  TipoVehiculo,
} from '@app/models';
import { avanzarReserva } from '@app/services/ciclo-reserva';
import { AuthService } from '@app/services/auth.service';
import { EstacionamientoService } from '@app/services/estacionamiento.service';
import { ReservaService } from '@app/services/reserva.service';
import { desdeFechaISO } from '@app/utils/fecha.util';

type Pestana = 'TODAS' | 'ACTIVAS' | 'PENDIENTES' | 'FINALIZADAS';

const ESTADOS_POR_PESTANA: Record<Pestana, EstadoReserva[] | null> = {
  TODAS: null,
  ACTIVAS: ['CONFIRMADA', 'ACTIVA'],
  PENDIENTES: ['PENDIENTE'],
  FINALIZADAS: ['FINALIZADA', 'CANCELADA'],
};

const PESTANAS: { valor: Pestana; etiqueta: string }[] = [
  { valor: 'TODAS', etiqueta: 'Todas' },
  { valor: 'ACTIVAS', etiqueta: 'Activas' },
  { valor: 'PENDIENTES', etiqueta: 'Pendientes' },
  { valor: 'FINALIZADAS', etiqueta: 'Finalizadas' },
];

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

/** Que puede hacer el propietario segun como este la reserva. */
const PASOS: Partial<Record<EstadoReserva, string>> = {
  PENDIENTE: 'Confirmar',
  CONFIRMADA: 'Registrar ingreso',
  ACTIVA: 'Registrar egreso',
};

const sinAcentos = (texto: string) =>
  texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Pantalla `/propietario/reservas` · rol PROPIETARIO
 *
 * Todas las reservas de los estacionamientos del propietario, con pestañas por
 * estado, busqueda por patente / estacionamiento / vehiculo y filtro por fecha.
 */
@Component({
  selector: 'app-reservas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, Tarjeta, Cargando, EstadoVacio, Etiqueta, Icono],
  templateUrl: './reservas.html',
})
export class Reservas {
  private readonly estacionamientos = inject(EstacionamientoService);
  private readonly reservas = inject(ReservaService);
  private readonly auth = inject(AuthService);

  protected readonly pestanas = PESTANAS;
  protected readonly etiquetaEstado = ETIQUETA_ESTADO_RESERVA;
  protected readonly etiquetaTipo = ETIQUETA_TIPO_VEHICULO;
  protected readonly tonoEstado = TONO_ESTADO;
  protected readonly iconoVehiculo = ICONO_VEHICULO;
  protected readonly pasos = PASOS;
  protected readonly desdeFechaISO = desdeFechaISO;

  protected readonly pestana = signal<Pestana>('TODAS');
  protected readonly busqueda = signal('');
  protected readonly fecha = signal('');
  protected readonly estacionamientoId = signal<Id | ''>('');

  protected readonly recursoEstacionamientos = rxResource({
    params: () => this.auth.usuario()?.id,
    stream: () => this.estacionamientos.listarDelPropietario(),
    defaultValue: [] as Estacionamiento[],
  });

  protected readonly recurso = rxResource({
    params: () => ({ ids: this.recursoEstacionamientos.value().map((e) => e.id) }),
    stream: ({ params }) => this.reservas.listarDeEstacionamientos(params.ids),
    defaultValue: [] as ReservaDetallada[],
  });

  /** Reservas que pasan la busqueda, la fecha y el estacionamiento (antes de la pestaña). */
  private readonly filtradas = computed(() => {
    const texto = sinAcentos(this.busqueda().trim());
    const fecha = this.fecha();
    const lote = this.estacionamientoId();

    return this.recurso
      .value()
      .filter((r) => !fecha || r.fecha === fecha)
      .filter((r) => !lote || r.estacionamientoId === lote)
      .filter((r) => {
        if (!texto) return true;
        const campos = [
          r.vehiculo.patente,
          r.vehiculo.marca ?? '',
          r.vehiculo.modelo ?? '',
          r.estacionamiento.nombre,
          r.cochera?.identificador ?? '',
        ];
        return campos.some((campo) => sinAcentos(campo).includes(texto));
      })
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || a.horaDesde.localeCompare(b.horaDesde));
  });

  protected readonly conteos = computed(() => {
    const lista = this.filtradas();
    const contar = (p: Pestana) => {
      const estados = ESTADOS_POR_PESTANA[p];
      return estados ? lista.filter((r) => estados.includes(r.estado)).length : lista.length;
    };
    return {
      TODAS: contar('TODAS'),
      ACTIVAS: contar('ACTIVAS'),
      PENDIENTES: contar('PENDIENTES'),
      FINALIZADAS: contar('FINALIZADAS'),
    } satisfies Record<Pestana, number>;
  });

  protected readonly visibles = computed(() => {
    const estados = ESTADOS_POR_PESTANA[this.pestana()];
    const lista = this.filtradas();
    return estados ? lista.filter((r) => estados.includes(r.estado)) : lista;
  });

  protected readonly hayFiltros = computed(
    () => Boolean(this.busqueda().trim() || this.fecha() || this.estacionamientoId()),
  );

  /** Reserva que se esta procesando: pinta el spinner en su fila. */
  protected readonly procesandoId = signal<Id | null>(null);
  protected readonly aviso = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  protected vehiculo(reserva: ReservaDetallada): string {
    const nombre = [reserva.vehiculo.marca, reserva.vehiculo.modelo].filter(Boolean).join(' ');
    return nombre || this.etiquetaTipo[reserva.vehiculo.tipo];
  }

  protected leer(evento: Event): string {
    return (evento.target as HTMLInputElement | HTMLSelectElement).value;
  }

  protected limpiarFiltros(): void {
    this.busqueda.set('');
    this.fecha.set('');
    this.estacionamientoId.set('');
  }

  /** Confirmar, registrar ingreso o registrar egreso, segun el estado. */
  protected avanzar(reserva: ReservaDetallada): void {
    const paso = avanzarReserva(this.reservas, reserva);
    if (!paso) return;

    this.procesandoId.set(reserva.id);
    this.aviso.set(null);
    this.error.set(null);

    paso.llamada.subscribe({
      next: () => {
        this.procesandoId.set(null);
        this.aviso.set(paso.aviso);
        this.recurso.reload();
      },
      error: (e: Error) => {
        this.procesandoId.set(null);
        this.error.set(e.message);
      },
    });
  }
}
