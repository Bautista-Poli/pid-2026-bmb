import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { Observable, forkJoin, map, of } from 'rxjs';
import { MapaEstacionamientos } from '@app/components/estacionamiento';
import {
  CampoBusqueda,
  Cargando,
  Chip,
  EstadoVacio,
  Icono,
  NombreIcono,
  Sugerencia,
} from '@app/components/ui';
import {
  ETIQUETA_TIPO_VEHICULO,
  Estacionamiento,
  FechaISO,
  FiltrosEstacionamiento,
  HoraHHmm,
  Id,
  Momento,
  OrdenEstacionamiento,
  TipoVehiculo,
  Vehiculo,
} from '@app/models';
import { EstacionamientoService } from '@app/services/estacionamiento.service';
import { DireccionGeoref, GeorefService, ZonaBusqueda } from '@app/services/georef.service';
import { UbicacionService } from '@app/services/ubicacion.service';
import { VehiculoService } from '@app/services/vehiculo.service';
import {
  ETIQUETA_ESTADO,
  EstadoDisponibilidad,
  estadoDisponibilidad,
  formatearDistancia,
  resumenHorario,
} from '@app/utils/disponibilidad.util';
import { minutosAPie } from '@app/utils/distancia.util';
import { aFechaISO } from '@app/utils/fecha.util';

/** Tope del rango de precios (por hora). En el tope, el maximo no filtra. */
const PRECIO_TOPE = 5000;
const PRECIO_PASO = 100;

const TIPOS: { tipo: TipoVehiculo; icono: NombreIcono }[] = [
  { tipo: 'AUTO', icono: 'auto' },
  { tipo: 'CAMIONETA', icono: 'camioneta' },
  { tipo: 'MOTO', icono: 'moto' },
];

const CLASE_ESTADO: Record<EstadoDisponibilidad, string> = {
  DISPONIBLE: 'bg-exito-suave text-exito',
  POCA: 'bg-baja/15 text-baja',
  AGOTADO: 'bg-ocupada/12 text-ocupada',
};

/** Lo que se edita en el panel. Se aplica recien con "Buscar". */
interface Panel {
  tipo: TipoVehiculo;
  fecha: FechaISO;
  /** Vacios: "ahora". */
  desde: HoraHHmm;
  hasta: HoraHHmm;
  precioMinimo: number;
  precioMaximo: number;
  orden: OrdenEstacionamiento;
  soloCubiertos: boolean;
}

/**
 * Pantalla `/conductor/explorar` · rol CONDUCTOR. Es el inicio del conductor.
 *
 * Panel de busqueda y filtros, resultados y un mapa con los estacionamientos
 * (color segun disponibilidad). En desktop el
 * panel va a la izquierda y el mapa a la derecha; en mobile los filtros se
 * pliegan debajo del buscador, y abajo del mapa va la lista.
 *
 * Las distancias se miden desde la ubicacion del conductor o desde el lugar
 * que elija en el buscador: una zona ("Palermo") o una direccion ("Pueyrredon
 * 2409"). Ese lugar aparece en el mapa como un pin propio y el mapa se centra
 * ahi, para ver que estacionamientos le quedan cerca.
 */
@Component({
  selector: 'app-mapa',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MapaEstacionamientos, CampoBusqueda, Cargando, Chip, EstadoVacio, Icono],
  templateUrl: './mapa.html',
  host: { class: 'flex flex-1 flex-col' },
})
export class Mapa {
  private readonly estacionamientos = inject(EstacionamientoService);
  private readonly vehiculos = inject(VehiculoService);
  private readonly georef = inject(GeorefService);
  private readonly ubicacion = inject(UbicacionService);
  private readonly router = inject(Router);

  protected readonly tipos = TIPOS;
  protected readonly etiquetaTipo = ETIQUETA_TIPO_VEHICULO;
  protected readonly etiquetaEstado = ETIQUETA_ESTADO;
  protected readonly claseEstado = CLASE_ESTADO;
  protected readonly precioTope = PRECIO_TOPE;
  protected readonly precioPaso = PRECIO_PASO;
  protected readonly hoy = aFechaISO(new Date());

  /* --------------------------------- Panel --------------------------------- */

  protected readonly panel = signal<Panel>({
    tipo: 'AUTO',
    fecha: this.hoy,
    desde: '',
    hasta: '',
    precioMinimo: 0,
    precioMaximo: PRECIO_TOPE,
    orden: 'DISTANCIA',
    soloCubiertos: false,
  });
  /** Lo ultimo que se busco. */
  private readonly aplicado = signal<Panel>(this.panel());

  /** En mobile los filtros se pliegan debajo del buscador. En desktop siempre se ven. */
  protected readonly filtrosAbiertos = signal(false);
  protected readonly intentoBuscar = signal(false);

  protected readonly errorHorario = computed(() => {
    const { fecha, desde, hasta } = this.panel();
    if (!desde && !hasta) return null;
    if (!fecha || fecha < this.hoy) return 'Elegí una fecha desde hoy.';
    if (!desde || !hasta) return 'Completá la hora de inicio y de fin, o dejá las dos vacías para buscar ahora.';
    if (hasta <= desde) return 'La hora de fin tiene que ser posterior a la de inicio.';
    return null;
  });

  protected readonly textoPrecio = computed(() => {
    const { precioMinimo, precioMaximo } = this.panel();
    const maximo = precioMaximo >= PRECIO_TOPE ? `${pesos(PRECIO_TOPE)}+` : pesos(precioMaximo);
    return `${pesos(precioMinimo)} - ${maximo}`;
  });

  protected cambiar(cambios: Partial<Panel>): void {
    this.panel.update((actual) => ({ ...actual, ...cambios }));
  }

  /** Los dos extremos del rango no se cruzan: el que se mueve empuja hasta el otro. */
  protected moverMinimo(valor: string): void {
    this.cambiar({ precioMinimo: Math.min(Number(valor), this.panel().precioMaximo - PRECIO_PASO) });
  }

  protected moverMaximo(valor: string): void {
    this.cambiar({ precioMaximo: Math.max(Number(valor), this.panel().precioMinimo + PRECIO_PASO) });
  }

  protected buscar(): void {
    this.intentoBuscar.set(true);
    if (this.errorHorario()) return;
    this.aplicado.set(this.panel());
    this.textoAplicado.set(this.destino() ? '' : this.texto().trim());
    this.filtrosAbiertos.set(false);
  }

  /** "Ordenar por" de los resultados: se aplica al toque, sin pasar por "Buscar". */
  protected ordenar(orden: string): void {
    const valor = orden as OrdenEstacionamiento;
    this.cambiar({ orden: valor });
    this.aplicado.update((actual) => ({ ...actual, orden: valor }));
  }

  /* -------------------------- Buscador y ubicacion ------------------------- */

  /** Lo escrito en el buscador. Sin elegir una sugerencia, filtra por nombre o zona. */
  protected readonly texto = signal('');
  private readonly textoAplicado = signal('');
  /** Zona o direccion elegida de las sugerencias: las distancias se miden desde ahi. */
  protected readonly destino = signal<DireccionGeoref | null>(null);

  protected escribir(texto: string): void {
    this.texto.set(texto);
    this.destino.set(null);
  }

  protected elegirDestino(sugerencia: Sugerencia): void {
    const destino = sugerencia.dato as DireccionGeoref;
    this.destino.set(destino);
    this.texto.set(destino.nombre);
    this.buscar();
  }

  protected usarMiUbicacion(): void {
    this.destino.set(null);
    this.texto.set('');
    this.textoAplicado.set('');
    this.ubicacion.solicitar();
  }

  /** Donde esta el conductor (el punto azul del mapa). */
  protected readonly ubicacionActual = this.ubicacion.posicion;

  /** Desde donde se miden las distancias. */
  protected readonly origen = computed(
    () => this.destino()?.coordenadas ?? this.ubicacion.posicion(),
  );
  protected readonly tituloOrigen = computed(() => (this.destino() ? 'Tu destino' : 'Tu ubicación'));
  protected readonly detalleOrigen = computed(() => {
    const destino = this.destino();
    return destino ? `${destino.nombre}, ${destino.detalle}` : null;
  });

  protected readonly sinOrigen = computed(() => {
    const estado = this.ubicacion.estado();
    return !this.destino() && (estado === 'denegada' || estado === 'no-disponible');
  });

  /**
   * Todos los estacionamientos publicados: de ahi salen las ciudades donde
   * buscar direcciones (sin acotar, Georef devuelve la misma altura en decenas
   * de ciudades del pais).
   */
  private readonly todos = rxResource({
    stream: () => this.estacionamientos.listar({}),
    defaultValue: [] as Estacionamiento[],
  });

  private readonly zonas = computed<ZonaBusqueda[]>(() => {
    const vistas = new Map<string, ZonaBusqueda>();
    for (const { direccion } of this.todos.value()) {
      if (!direccion.ciudad || !direccion.provincia) continue;
      vistas.set(`${direccion.ciudad}|${direccion.provincia}`, {
        ciudad: direccion.ciudad,
        provincia: direccion.provincia,
      });
    }
    return [...vistas.values()];
  });

  /**
   * Sugerencias del buscador: zonas ("Palermo") y, si lo escrito tiene altura,
   * direcciones ("Pueyrredon 2409"). Las dos traen coordenadas para centrar el
   * mapa. Se busca solo donde hay estacionamientos.
   */
  protected readonly buscarDirecciones = (texto: string): Observable<Sugerencia[]> => {
    const zonas = this.zonas();
    const provincias = [...new Set(zonas.map((zona) => zona.provincia))];
    const direcciones$ = /\d/.test(texto) ? this.georef.buscarDestinos(texto, zonas) : of([]);
    return forkJoin([direcciones$, this.georef.buscarZonas(texto, provincias)]).pipe(
      map(([direcciones, barrios]) =>
        [...direcciones, ...barrios].map((d) => ({ nombre: d.nombre, detalle: d.detalle, dato: d })),
      ),
    );
  };

  /* ------------------------------- Resultados ------------------------------ */

  private readonly consulta = computed<FiltrosEstacionamiento>(() => {
    const panel = this.aplicado();
    return {
      busqueda: this.textoAplicado(),
      tipoVehiculo: panel.tipo,
      precioMinimo: panel.precioMinimo > 0 ? panel.precioMinimo : null,
      precioMaximo: panel.precioMaximo < PRECIO_TOPE ? panel.precioMaximo : null,
      soloCubiertos: panel.soloCubiertos,
      orden: panel.orden,
      momento: momentoDe(panel),
      origen: this.origen(),
    };
  });

  protected readonly recurso = rxResource({
    params: () => this.consulta(),
    stream: ({ params }) => this.estacionamientos.listar(params),
    defaultValue: [] as Estacionamiento[],
  });

  protected readonly resultados = computed(() => this.recurso.value());
  protected readonly orden = computed(() => this.aplicado().orden);

  /** El que se toco en el mapa o sobre el que esta el mouse en la lista. */
  protected readonly seleccionadoId = signal<Id | null>(null);

  protected seleccionarDesdeMapa(id: Id): void {
    this.seleccionadoId.set(id);
    document
      .getElementById(`estacionamiento-${id}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  protected irAReservar(estacionamiento: Estacionamiento): void {
    void this.router.navigate(['/conductor/reservar', estacionamiento.id]);
  }

  /* ---------------------------- Datos de la tarjeta ------------------------ */

  protected estado(estacionamiento: Estacionamiento): EstadoDisponibilidad {
    return estadoDisponibilidad(estacionamiento.cocherasDisponibles);
  }

  /** "350 m · 5 min a pie" */
  protected distancia(estacionamiento: Estacionamiento): string | null {
    const km = estacionamiento.distanciaKm;
    if (km == null) return null;
    return `${formatearDistancia(km)} · ${minutosAPie(km)} min a pie`;
  }

  /** "$1.200/h"; si no cobra por hora, la estadia o la jornada. */
  protected precio(estacionamiento: Estacionamiento): string {
    const { hora, estadia, jornada } = estacionamiento.tarifas;
    if (hora != null) return `${pesos(hora)}/h`;
    if (estadia != null) return `${pesos(estadia)} estadía`;
    if (jornada != null) return `${pesos(jornada)} jornada`;
    return '';
  }

  protected horario(estacionamiento: Estacionamiento): string {
    return resumenHorario(estacionamiento.horarios);
  }

  constructor() {
    this.ubicacion.solicitar();

    // El tipo arranca en el del vehiculo predeterminado del conductor (una sola vez).
    let tipoInicialPuesto = false;
    effect(() => {
      const vehiculos = this.vehiculosDelConductor.value();
      if (tipoInicialPuesto || vehiculos.length === 0) return;
      tipoInicialPuesto = true;
      const tipo = (vehiculos.find((v) => v.predeterminado) ?? vehiculos[0]).tipo;
      untracked(() => {
        this.cambiar({ tipo });
        this.aplicado.update((actual) => ({ ...actual, tipo }));
      });
    });
  }

  private readonly vehiculosDelConductor = rxResource({
    stream: () => this.vehiculos.listarMisVehiculos(),
    defaultValue: [] as Vehiculo[],
  });
}

function momentoDe(panel: Panel): Momento {
  if (!panel.desde || !panel.hasta) return { tipo: 'AHORA' };
  return { tipo: 'FRANJA', fecha: panel.fecha, horaDesde: panel.desde, horaHasta: panel.hasta };
}

function pesos(monto: number): string {
  return `$${monto.toLocaleString('es-AR')}`;
}
