import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import {
  Boton,
  Cargando,
  EstadoVacio,
  Etiqueta,
  Icono,
  Modal,
  NombreIcono,
  Tarjeta,
  TonoEtiqueta,
} from '@app/components/ui';
import {
  EstadoReserva,
  Estacionamiento,
  esVencida,
  etiquetaReserva,
  ETIQUETA_TIPO_VEHICULO,
  Id,
  ReservaDetallada,
  TipoVehiculo,
} from '@app/models';
import { avanzarReserva, puedeAvanzar, puedeMarcarAusente, rutaAcceso } from '@app/services/ciclo-reserva';
import { AuthService } from '@app/services/auth.service';
import { EstacionamientoService } from '@app/services/estacionamiento.service';
import { ReservaService } from '@app/services/reserva.service';
import { desdeFechaISO } from '@app/utils/fecha.util';

/**
 * Secciones en el orden en que se muestran, una debajo de la otra: nunca una
 * lista mezclada. Las canceladas van al final y se ocultan hasta pedirlas.
 */
const SECCIONES: { clave: string; titulo: string; estados: EstadoReserva[] }[] = [
  { clave: 'ACTIVAS', titulo: 'Activas', estados: ['CONFIRMADA', 'ACTIVA'] },
  { clave: 'PENDIENTES', titulo: 'Pendientes', estados: ['PENDIENTE'] },
  { clave: 'FINALIZADAS', titulo: 'Finalizadas', estados: ['FINALIZADA'] },
  { clave: 'NO_SHOW', titulo: 'Ausentes', estados: ['NO_SHOW'] },
  { clave: 'CANCELADAS', titulo: 'Canceladas y vencidas', estados: ['CANCELADA'] },
];

const TONO_ESTADO: Record<EstadoReserva, TonoEtiqueta> = {
  PENDIENTE: 'aviso',
  CONFIRMADA: 'acento',
  ACTIVA: 'exito',
  FINALIZADA: 'neutro',
  CANCELADA: 'peligro',
  NO_SHOW: 'peligro',
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
  imports: [DatePipe, Tarjeta, Cargando, EstadoVacio, Etiqueta, Icono, Boton, Modal],
  templateUrl: './reservas.html',
})
export class Reservas {
  private readonly estacionamientos = inject(EstacionamientoService);
  private readonly reservas = inject(ReservaService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly etiquetaEstado = etiquetaReserva;
  protected readonly etiquetaTipo = ETIQUETA_TIPO_VEHICULO;
  /** Vencida (no la confirmaste a tiempo) en amarillo, distinta de una cancelacion. */
  protected tonoEstado(reserva: ReservaDetallada): TonoEtiqueta {
    return esVencida(reserva) ? 'aviso' : TONO_ESTADO[reserva.estado];
  }
  protected readonly iconoVehiculo = ICONO_VEHICULO;
  protected readonly pasos = PASOS;
  protected readonly desdeFechaISO = desdeFechaISO;

  protected readonly busqueda = signal('');
  protected readonly fecha = signal('');
  protected readonly estacionamientoId = signal<Id | ''>('');
  /** Las canceladas quedan ocultas hasta que el propietario las pide. */
  protected readonly verCanceladas = signal(false);

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
      .filter((r) => this.verCanceladas() || r.estado !== 'CANCELADA')
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

  /** Cada seccion con sus reservas; las vacias no se muestran. */
  protected readonly secciones = computed(() => {
    const lista = this.filtradas();
    return SECCIONES.map((seccion) => ({
      ...seccion,
      reservas: lista.filter((r) => seccion.estados.includes(r.estado)),
    })).filter((seccion) => seccion.reservas.length > 0);
  });

  protected readonly hayFiltros = computed(
    () => Boolean(this.busqueda().trim() || this.fecha() || this.estacionamientoId()),
  );

  /** Reserva que se esta procesando: pinta el spinner en su fila. */
  protected readonly procesandoId = signal<Id | null>(null);
  protected readonly aviso = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  /** El boton del paso siguiente, o null si hoy no corresponde (p. ej. ingreso fuera de la ventana). */
  protected pasoDe(reserva: ReservaDetallada): string | null {
    return puedeAvanzar(reserva) ? (this.pasos[reserva.estado] ?? null) : null;
  }

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

  /** Confirmar; ingreso y egreso pasan por la pantalla de acceso (codigo o QR). */
  protected avanzar(reserva: ReservaDetallada): void {
    const ruta = rutaAcceso(reserva);
    if (ruta) {
      void this.router.navigate(ruta);
      return;
    }

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

  /* ------------------------ ausente a mano (no-show) ------------------------ */

  /** Reserva que se esta por marcar ausente: abre el modal de confirmacion. */
  protected readonly aMarcarAusente = signal<ReservaDetallada | null>(null);
  protected readonly puedeMarcarAusente = (reserva: ReservaDetallada) => puedeMarcarAusente(reserva);

  protected marcarAusente(reserva: ReservaDetallada): void {
    this.procesandoId.set(reserva.id);
    this.aviso.set(null);
    this.error.set(null);

    this.reservas.marcarAusente(reserva.id).subscribe({
      next: () => {
        this.procesandoId.set(null);
        this.aMarcarAusente.set(null);
        this.aviso.set(`Marcaste ausente a ${reserva.vehiculo.patente}. La cochera quedó libre.`);
        this.recurso.reload();
      },
      error: (e: Error) => {
        this.procesandoId.set(null);
        this.aMarcarAusente.set(null);
        this.error.set(e.message);
      },
    });
  }
}
