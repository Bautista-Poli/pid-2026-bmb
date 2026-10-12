import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import {
  Boton,
  Cargando,
  EstadoVacio,
  Etiqueta,
  Icono,
  Modal,
  Tarjeta,
  TonoEtiqueta,
} from '@app/components/ui';
import {
  AutorMensaje,
  CanalIncidencia,
  ETIQUETA_AUTOR,
  ETIQUETA_ESTADO_INCIDENCIA,
  ETIQUETA_MOTIVO_RECLAMO,
  ETIQUETA_RESOLUCION,
  ETIQUETA_TIPO_INCIDENCIA,
  EstadoIncidencia,
  Id,
  Incidencia,
  IncidenciaDetallada,
  MensajeIncidencia,
} from '@app/models';
import { AuthService } from '@app/services/auth.service';
import { IncidenciaService } from '@app/services/incidencia.service';

const TONO_ESTADO: Record<EstadoIncidencia, TonoEtiqueta> = {
  ABIERTA: 'aviso',
  DENUNCIADA: 'peligro',
  RESUELTA: 'neutro',
  RETIRADA: 'neutro',
};

type Accion = 'RESOLVER' | 'DENUNCIAR' | 'ACEPTAR' | 'RETIRAR';

const PESOS = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });

/** Cada cuanto se refrescan la lista y el hilo: es un ida y vuelta entre personas. */
const REFRESCO_MS = 20_000;

/**
 * Pantalla `/propietario/incidencias` y `/conductor/incidencias`.
 *
 * Problemas de una reserva (auto que se paso de su horario, reserva que se
 * quedo sin cochera) con tres chats: el general entre el estacionamiento y el
 * conductor (la moderacion solo lee) y, si alguno denuncia, uno privado de
 * cada parte con la moderacion. El propietario la marca resuelta mientras no
 * este denunciada; denunciar lo puede cualquiera de los dos.
 *
 * Reclamos (los abre el conductor): el propietario no los cierra, propone una
 * devolucion en el chat general y el conductor la acepta o retira el reclamo.
 * `?id=` abre una incidencia (asi llega el conductor despues de reclamar).
 */
@Component({
  selector: 'app-incidencias',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, Boton, Cargando, EstadoVacio, Etiqueta, Icono, Modal, Tarjeta],
  templateUrl: './incidencias.html',
})
export class Incidencias {
  private readonly incidencias = inject(IncidenciaService);
  private readonly auth = inject(AuthService);

  protected readonly etiquetaTipo = ETIQUETA_TIPO_INCIDENCIA;
  protected readonly etiquetaEstado = ETIQUETA_ESTADO_INCIDENCIA;
  protected readonly tonoEstado = TONO_ESTADO;
  protected readonly etiquetaMotivo = ETIQUETA_MOTIVO_RECLAMO;
  protected readonly etiquetaResolucion = ETIQUETA_RESOLUCION;
  protected readonly pesos = (monto: number) => `$ ${PESOS.format(monto)}`;

  protected readonly esPropietario = computed(() => this.auth.rol() === 'PROPIETARIO');

  protected readonly recursoLista = rxResource({
    stream: () => this.incidencias.listar(),
    defaultValue: [] as Incidencia[],
  });

  protected readonly abiertas = computed(
    () => this.recursoLista.value().filter((i) => i.estado === 'ABIERTA' || i.estado === 'DENUNCIADA').length,
  );

  protected readonly seleccionId = signal<Id | null>(null);

  protected readonly recursoDetalle = rxResource({
    params: () => this.seleccionId() ?? undefined,
    stream: ({ params }) => this.incidencias.obtener(params),
  });

  /** El detalle abierto, o null. Se pisa con lo que devuelven las acciones. */
  protected readonly detalle = computed<IncidenciaDetallada | null>(
    () => (this.seleccionId() ? (this.recursoDetalle.value() ?? null) : null),
  );

  /** Chat abierto en el detalle: el general o el privado con la moderacion. */
  protected readonly canal = signal<CanalIncidencia>('GENERAL');

  /** Mensajes del chat elegido (el backend ya filtra lo que la parte no puede ver). */
  protected readonly mensajesDelCanal = computed(() =>
    (this.detalle()?.mensajes ?? []).filter((m) => m.canal === this.canal()),
  );

  /** Canal privado de quien mira, si la incidencia ya fue denunciada. */
  protected readonly canalPrivado = computed<CanalIncidencia | null>(
    () => this.detalle()?.canales.find((c) => c !== 'GENERAL') ?? null,
  );

  protected readonly borrador = signal('');
  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);

  /** Devolucion que el propietario propone junto con su mensaje (solo en un reclamo abierto). */
  protected readonly montoPropuesto = signal<number | null>(null);

  /** El propietario puede proponer: reclamo abierto, en el chat con el conductor. */
  protected readonly puedeProponer = computed(() => {
    const incidencia = this.detalle();
    return (
      this.esPropietario() &&
      incidencia?.tipo === 'RECLAMO' &&
      incidencia.estado === 'ABIERTA' &&
      this.canal() === 'GENERAL'
    );
  });

  /** La propuesta escrita supera lo que queda por devolver. */
  protected readonly propuestaExcedida = computed(() => {
    const monto = this.montoPropuesto();
    return monto !== null && monto > (this.detalle()?.tope ?? 0);
  });

  /** Modales de las acciones. */
  protected readonly accion = signal<Accion | null>(null);
  protected readonly textoAccion = signal('');
  protected readonly procesando = signal(false);

  constructor() {
    const id = inject(ActivatedRoute).snapshot.queryParamMap.get('id');
    if (id) this.seleccionId.set(id);

    const reloj = setInterval(() => {
      this.recursoLista.reload();
      if (this.seleccionId()) this.recursoDetalle.reload();
    }, REFRESCO_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(reloj));
  }

  protected abrir(incidencia: Incidencia): void {
    this.seleccionId.set(incidencia.id);
    this.canal.set('GENERAL');
    this.borrador.set('');
    this.montoPropuesto.set(null);
    this.error.set(null);
  }

  protected cerrar(): void {
    this.seleccionId.set(null);
  }

  /** Mensajes propios a la derecha; los del sistema, centrados. */
  protected lado(mensaje: MensajeIncidencia): 'propio' | 'ajeno' | 'sistema' {
    if (mensaje.rolAutor === 'SISTEMA') return 'sistema';
    return mensaje.rolAutor === (this.auth.rol() as AutorMensaje) ? 'propio' : 'ajeno';
  }

  protected autor(mensaje: MensajeIncidencia): string {
    const rol = ETIQUETA_AUTOR[mensaje.rolAutor];
    return mensaje.autor ? `${mensaje.autor} · ${rol}` : rol;
  }

  protected leer(evento: Event): string {
    return (evento.target as HTMLTextAreaElement).value;
  }

  /** Vacio = sin propuesta. */
  protected leerMonto(evento: Event): void {
    const valor = (evento.target as HTMLInputElement).value;
    this.montoPropuesto.set(valor === '' ? null : Number(valor));
  }

  protected enviar(incidencia: IncidenciaDetallada): void {
    const texto = this.borrador().trim();
    if (!texto || this.enviando() || this.propuestaExcedida()) return;

    const monto = this.puedeProponer() ? (this.montoPropuesto() ?? undefined) : undefined;
    this.enviando.set(true);
    this.error.set(null);
    this.incidencias.responder(incidencia.id, texto, this.canal(), monto).subscribe({
      next: (actualizada) => {
        this.enviando.set(false);
        this.borrador.set('');
        this.montoPropuesto.set(null);
        this.recursoDetalle.set(actualizada);
        this.recursoLista.reload();
      },
      error: (e: Error) => {
        this.enviando.set(false);
        this.error.set(e.message);
      },
    });
  }

  protected abrirAccion(accion: Accion): void {
    this.textoAccion.set('');
    this.error.set(null);
    this.accion.set(accion);
  }

  /** Denunciar pide un motivo (lo lee el administrador); resolver, un comentario opcional. */
  protected readonly accionValida = computed(
    () => this.accion() !== 'DENUNCIAR' || this.textoAccion().trim().length >= 5,
  );

  protected confirmarAccion(incidencia: IncidenciaDetallada): void {
    const accion = this.accion();
    if (!accion || !this.accionValida() || this.procesando()) return;

    const texto = this.textoAccion().trim();
    const llamadas = {
      RESOLVER: () => this.incidencias.resolver(incidencia.id, texto || undefined),
      DENUNCIAR: () => this.incidencias.denunciar(incidencia.id, texto),
      // Se manda la propuesta que el conductor tiene en pantalla: si cambio, la API da 409.
      ACEPTAR: () => this.incidencias.aceptar(incidencia.id, incidencia.propuestaVigente ?? 0),
      RETIRAR: () => this.incidencias.retirar(incidencia.id),
    };
    const llamada = llamadas[accion]();

    this.procesando.set(true);
    llamada.subscribe({
      next: (actualizada) => {
        this.procesando.set(false);
        this.accion.set(null);
        this.recursoDetalle.set(actualizada);
        this.recursoLista.reload();
        // Al denunciar se abre el chat con la moderacion: se muestra ese.
        if (accion === 'DENUNCIAR') this.canal.set(this.canalPrivado() ?? 'GENERAL');
      },
      error: (e: Error) => {
        this.procesando.set(false);
        this.error.set(e.message);
        // Si el propietario cambio la propuesta, se trae la nueva para que la vea.
        if (accion === 'ACEPTAR') this.recursoDetalle.reload();
      },
    });
  }
}
