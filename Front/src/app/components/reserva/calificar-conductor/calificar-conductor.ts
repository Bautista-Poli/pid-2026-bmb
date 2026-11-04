import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Boton, Chip, Modal } from '@app/components/ui';
import {
  ETIQUETAS_CONDUCTOR_NEGATIVAS,
  ETIQUETAS_CONDUCTOR_POSITIVAS,
  EtiquetaConductor,
  ReservaDetallada,
  TEXTO_ETIQUETA_CONDUCTOR,
} from '@app/models';
import { CalificacionService } from '@app/services/calificacion.service';

const COMENTARIO_MAX = 500;

/**
 * Modal "Calificar conductor": el propietario le pone de 1 a 5 estrellas al
 * conductor de una reserva finalizada o ausente, con etiquetas rapidas y un
 * comentario opcional. Una sola vez por reserva.
 */
@Component({
  selector: 'app-calificar-conductor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Boton, Chip, Modal, FormsModule],
  template: `
    <ui-modal titulo="Calificar conductor" [abierto]="reserva() !== null" (cerrado)="cerrar()">
      @if (reserva(); as r) {
        <form class="flex flex-col gap-4" (ngSubmit)="enviar(r)">
          <p class="text-[13.5px] text-grafito">
            El conductor de <span class="num-tabular font-medium text-tinta">{{ r.vehiculo.patente }}</span>.
            Tu calificación ayuda a otros estacionamientos a conocerlo.
          </p>

          <div class="flex gap-1" role="radiogroup" aria-label="Puntaje">
            @for (n of estrellas; track n) {
              <button
                type="button"
                role="radio"
                class="text-[28px] leading-none transition-colors"
                [class.text-oro]="n <= puntaje()"
                [class.text-humo]="n > puntaje()"
                [attr.aria-checked]="n === puntaje()"
                [attr.aria-label]="n + (n === 1 ? ' estrella' : ' estrellas')"
                (click)="puntaje.set(n)"
              >
                ★
              </button>
            }
          </div>

          <div class="flex flex-col gap-2">
            <span class="label-campo">¿Qué destacarías?</span>
            <div class="flex flex-wrap gap-2">
              @for (etiqueta of positivas; track etiqueta) {
                <ui-chip [activo]="marcada(etiqueta)" (alternar)="alternar(etiqueta)">{{ texto[etiqueta] }}</ui-chip>
              }
            </div>
            <div class="flex flex-wrap gap-2">
              @for (etiqueta of negativas; track etiqueta) {
                <ui-chip [activo]="marcada(etiqueta)" (alternar)="alternar(etiqueta)">{{ texto[etiqueta] }}</ui-chip>
              }
            </div>
          </div>

          <label class="campo">
            <span class="label-campo">Comentario (opcional)</span>
            <textarea
              name="comentario"
              rows="3"
              class="rounded-control border border-borde bg-papel px-3.5 py-3 text-[14px] text-tinta
                     placeholder:text-humo focus:border-acento focus:outline-none"
              [maxLength]="comentarioMax"
              [ngModel]="comentario()"
              (ngModelChange)="comentario.set($event)"
            ></textarea>
            <span class="campo-ayuda num-tabular">{{ comentario().length }}/{{ comentarioMax }}</span>
          </label>

          @if (error(); as mensaje) {
            <p class="text-[13px] text-ocupada" role="alert">{{ mensaje }}</p>
          }

          <ui-boton tipo="submit" variante="primario" [bloque]="true" [cargando]="enviando()" [deshabilitado]="puntaje() === 0">
            Guardar calificación
          </ui-boton>
        </form>
      }
    </ui-modal>
  `,
})
export class CalificarConductor {
  private readonly calificaciones = inject(CalificacionService);

  /** null = cerrado. */
  readonly reserva = input<ReservaDetallada | null>(null);
  readonly cerrado = output<void>();
  readonly calificada = output<void>();

  protected readonly estrellas = [1, 2, 3, 4, 5];
  protected readonly positivas = ETIQUETAS_CONDUCTOR_POSITIVAS;
  protected readonly negativas = ETIQUETAS_CONDUCTOR_NEGATIVAS;
  protected readonly texto = TEXTO_ETIQUETA_CONDUCTOR;
  protected readonly comentarioMax = COMENTARIO_MAX;

  protected readonly puntaje = signal(0);
  protected readonly etiquetas = signal<EtiquetaConductor[]>([]);
  protected readonly comentario = signal('');
  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected marcada(etiqueta: EtiquetaConductor): boolean {
    return this.etiquetas().includes(etiqueta);
  }

  protected alternar(etiqueta: EtiquetaConductor): void {
    this.etiquetas.update((actuales) =>
      actuales.includes(etiqueta) ? actuales.filter((e) => e !== etiqueta) : [...actuales, etiqueta],
    );
  }

  protected enviar(reserva: ReservaDetallada): void {
    if (this.puntaje() === 0 || this.enviando()) return;
    this.enviando.set(true);
    this.error.set(null);
    this.calificaciones
      .calificarConductor(reserva.id, {
        puntaje: this.puntaje(),
        etiquetas: this.etiquetas(),
        comentario: this.comentario(),
      })
      .subscribe({
        next: () => {
          this.enviando.set(false);
          this.limpiar();
          this.calificada.emit();
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
    this.etiquetas.set([]);
    this.comentario.set('');
    this.error.set(null);
  }
}
