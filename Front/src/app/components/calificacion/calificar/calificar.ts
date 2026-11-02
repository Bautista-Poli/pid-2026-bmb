import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Boton, Modal } from '@app/components/ui';
import { Id } from '@app/models';
import { CalificacionService } from '@app/services/calificacion.service';

/** Que se califica: la reserva y una descripcion para que se sepa cual es. */
export interface ObjetoCalificacion {
  idReserva: Id;
  /** "Centro · 18 oct 08:00" o el nombre del conductor. */
  descripcion: string;
}

const COMENTARIO_MAX = 500;

/**
 * Modal para calificar la otra parte de una reserva: 1 a 5 estrellas y un
 * comentario opcional que solo ve quien lo recibe. El lado (conductor o
 * propietario) lo decide la API por el perfil activo.
 */
@Component({
  selector: 'app-calificar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Boton, Modal, FormsModule],
  template: `
    <ui-modal [titulo]="titulo()" [abierto]="objeto() !== null" (cerrado)="cerrar()">
      @if (objeto(); as o) {
        <form class="flex flex-col gap-4" (ngSubmit)="enviar(o)">
          <p class="text-[13.5px] text-grafito">{{ o.descripcion }}</p>

          <div class="flex gap-0.5" role="radiogroup" aria-label="Puntaje">
            @for (n of estrellas; track n) {
              <button
                type="button"
                role="radio"
                class="grid size-11 place-items-center rounded-control text-[30px] leading-none transition-colors
                       hover:bg-acento-suave focus-visible:bg-acento-suave"
                [class.text-estrella]="n <= puntaje()"
                [class.text-humo]="n > puntaje()"
                [attr.aria-checked]="n === puntaje()"
                [attr.aria-label]="n + ' estrellas'"
                (click)="puntaje.set(n)"
              >
                ★
              </button>
            }
          </div>

          <label class="campo">
            <span class="label-campo">Comentario (opcional)</span>
            <textarea
              name="comentario"
              rows="3"
              class="rounded-control border border-borde bg-papel px-3.5 py-3 text-[14px] text-tinta
                     placeholder:text-humo focus:border-acento focus:outline-none"
              [maxLength]="comentarioMax"
              placeholder="Solo lo ve quien recibe la calificación."
              [ngModel]="comentario()"
              (ngModelChange)="comentario.set($event)"
            ></textarea>
            <span class="campo-ayuda num-tabular">{{ comentario().length }}/{{ comentarioMax }}</span>
          </label>

          @if (error(); as mensaje) {
            <p class="text-[13px] text-ocupada" role="alert">{{ mensaje }}</p>
          }

          <ui-boton tipo="submit" variante="primario" [bloque]="true" [cargando]="enviando()" [deshabilitado]="!valido()">
            Enviar calificación
          </ui-boton>
        </form>
      }
    </ui-modal>
  `,
})
export class Calificar {
  private readonly calificaciones = inject(CalificacionService);

  readonly titulo = input.required<string>();
  /** null = cerrado. */
  readonly objeto = input<ObjetoCalificacion | null>(null);
  readonly cerrado = output<void>();
  readonly calificado = output<void>();

  protected readonly estrellas = [1, 2, 3, 4, 5];
  protected readonly comentarioMax = COMENTARIO_MAX;
  protected readonly puntaje = signal(0);
  protected readonly comentario = signal('');
  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly valido = computed(() => this.puntaje() >= 1 && this.comentario().length <= COMENTARIO_MAX);

  protected enviar(objeto: ObjetoCalificacion): void {
    if (!this.valido() || this.enviando()) return;
    this.enviando.set(true);
    this.error.set(null);
    this.calificaciones
      .calificar(objeto.idReserva, { puntaje: this.puntaje(), comentario: this.comentario().trim() })
      .subscribe({
        next: () => {
          this.enviando.set(false);
          this.limpiar();
          this.calificado.emit();
        },
        error: (e: Error) => {
          this.enviando.set(false);
          this.error.set(e.message);
        },
      });
  }

  protected cerrar(): void {
    this.limpiar();
    this.cerrado.emit();
  }

  private limpiar(): void {
    this.puntaje.set(0);
    this.comentario.set('');
    this.error.set(null);
  }
}
