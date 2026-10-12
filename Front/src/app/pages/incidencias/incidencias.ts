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
};

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

  protected readonly esPropietario = computed(() => this.auth.rol() === 'PROPIETARIO');

  protected readonly recursoLista = rxResource({
    stream: () => this.incidencias.listar(),
    defaultValue: [] as Incidencia[],
  });

  protected readonly abiertas = computed(
    () => this.recursoLista.value().filter((i) => i.estado !== 'RESUELTA').length,
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

  /** Modales del propietario. */
  protected readonly accion = signal<'RESOLVER' | 'DENUNCIAR' | null>(null);
  protected readonly textoAccion = signal('');
  protected readonly procesando = signal(false);

  constructor() {
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

  protected enviar(incidencia: IncidenciaDetallada): void {
    const texto = this.borrador().trim();
    if (!texto || this.enviando()) return;

    this.enviando.set(true);
    this.error.set(null);
    this.incidencias.responder(incidencia.id, texto, this.canal()).subscribe({
      next: (actualizada) => {
        this.enviando.set(false);
        this.borrador.set('');
        this.recursoDetalle.set(actualizada);
        this.recursoLista.reload();
      },
      error: (e: Error) => {
        this.enviando.set(false);
        this.error.set(e.message);
      },
    });
  }

  protected abrirAccion(accion: 'RESOLVER' | 'DENUNCIAR'): void {
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
    const llamada =
      accion === 'RESOLVER'
        ? this.incidencias.resolver(incidencia.id, texto || undefined)
        : this.incidencias.denunciar(incidencia.id, texto);

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
      },
    });
  }
}
