import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Boton, Cargando, EstadoVacio } from '@app/components/ui';
import {
  CATEGORIAS_CALIFICACION,
  CategoriaCalificacion,
  ETIQUETAS_CALIFICACION,
  EtiquetaCalificacion,
  ReservaDetallada,
  TEXTO_ETIQUETA,
  formatearNota,
} from '@app/models';
import { CalificacionService } from '@app/services/calificacion.service';
import { ReservaService } from '@app/services/reserva.service';

const ESTRELLAS = [1, 2, 3, 4, 5] as const;
const MAX_COMENTARIO = 500;

const HORA = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
const hora = (instante: string | null) => (instante ? HORA.format(new Date(instante)) : '');

/**
 * Pantalla `/conductor/calificar/:reservaId` · rol CONDUCTOR
 *
 * Despues del egreso, el conductor califica el estacionamiento de 1 a 5 en
 * cinco categorias, con etiquetas y un comentario opcionales. Solo se puede si
 * la reserva se uso (entro y salio con el QR), una vez y dentro de los 7 dias:
 * si no, la pantalla lo explica en vez de mostrar el formulario.
 */
@Component({
  selector: 'app-calificar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Boton, Cargando, EstadoVacio, RouterLink],
  templateUrl: './calificar.html',
  styleUrl: './calificar.css',
})
export class Calificar {
  private readonly reservas = inject(ReservaService);
  private readonly calificaciones = inject(CalificacionService);

  /** Parametro de la ruta (withComponentInputBinding). */
  readonly reservaId = input.required<string>();

  protected readonly categorias = CATEGORIAS_CALIFICACION;
  protected readonly estrellas = ESTRELLAS;
  protected readonly etiquetas = ETIQUETAS_CALIFICACION;
  protected readonly textoEtiqueta = TEXTO_ETIQUETA;
  protected readonly maxComentario = MAX_COMENTARIO;
  protected readonly hora = hora;

  /** No hay `GET /reservas/:id` para el conductor: se busca entre las suyas. */
  protected readonly recurso = rxResource({
    params: () => this.reservaId(),
    stream: () => this.reservas.listarMisReservas(),
    defaultValue: [] as ReservaDetallada[],
  });

  protected readonly reserva = computed(() => this.recurso.value().find((r) => r.id === this.reservaId()) ?? null);
  protected readonly nombreEstacionamiento = computed(() => this.reserva()?.estacionamiento.nombre ?? '');

  protected readonly notas = signal<Partial<Record<CategoriaCalificacion, number>>>({});
  protected readonly elegidas = signal<ReadonlySet<EtiquetaCalificacion>>(new Set());
  protected readonly comentario = signal('');

  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);
  /** El promedio que quedo, una vez enviada. */
  protected readonly enviada = signal<number | null>(null);

  protected readonly faltan = computed(
    () => this.categorias.filter((c) => this.notas()[c.codigo] == null).length,
  );

  protected readonly textoBoton = computed(() => {
    const faltan = this.faltan();
    if (faltan === 0) return 'Enviar calificación';
    return faltan === 1 ? 'Calificá 1 categoría más' : `Calificá ${faltan} categorías más`;
  });

  protected readonly promedioEnviado = computed(() => formatearNota(this.enviada()));

  protected nota(categoria: CategoriaCalificacion): number {
    return this.notas()[categoria] ?? 0;
  }

  protected elegir(categoria: CategoriaCalificacion, valor: number): void {
    this.notas.update((actual) => ({ ...actual, [categoria]: valor }));
  }

  /** Marca o desmarca una etiqueta. */
  protected alternar(etiqueta: EtiquetaCalificacion): void {
    this.elegidas.update((actual) => {
      const nuevas = new Set(actual);
      if (nuevas.has(etiqueta)) nuevas.delete(etiqueta);
      else nuevas.add(etiqueta);
      return nuevas;
    });
  }

  protected etiquetaEstrella(categoria: string, valor: number): string {
    return `${categoria}: ${valor} ${valor === 1 ? 'estrella' : 'estrellas'}`;
  }

  /** Guarda la calificacion (5 categorias, etiquetas y comentario) y vuelve a Mis reservas. */
  protected enviar(): void {
    const reserva = this.reserva();
    const notas = this.notas();
    if (!reserva || this.faltan() > 0 || this.enviando()) return;

    this.enviando.set(true);
    this.error.set(null);
    this.calificaciones
      .calificar(reserva.id, {
        notas: notas as Record<CategoriaCalificacion, number>,
        etiquetas: [...this.elegidas()],
        comentario: this.comentario(),
      })
      .subscribe({
        next: (calificacion) => {
          this.enviando.set(false);
          this.enviada.set(calificacion.promedio);
        },
        // El interceptor de errores ya deja el mensaje de la API en `message`.
        error: (e: Error) => {
          this.enviando.set(false);
          this.error.set(e.message || 'No pudimos guardar la calificación. Probá de nuevo.');
        },
      });
  }
}
