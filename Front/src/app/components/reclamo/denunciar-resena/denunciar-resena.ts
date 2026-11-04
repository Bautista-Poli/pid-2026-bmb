import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Boton, Modal } from '@app/components/ui';
import { Id, MotivoDenunciaResena, TEXTO_MOTIVO_DENUNCIA } from '@app/models';
import { CalificacionService } from '@app/services/calificacion.service';

const DETALLE_MAX = 500;

/**
 * Modal "Denunciar reseña": la parte calificada (propietario o conductor) pide
 * que la moderacion revise una reseña, con un motivo y un detalle opcional.
 * Se denuncia una sola vez; la reseña sigue contando hasta que se oculte.
 */
@Component({
  selector: 'app-denunciar-resena',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Boton, Modal, FormsModule],
  template: `
    <ui-modal titulo="Denunciar reseña" [abierto]="calificacionId() !== null" (cerrado)="cerrar()">
      @if (calificacionId(); as id) {
        <form class="flex flex-col gap-4" (ngSubmit)="enviar(id)">
          <p class="text-[13.5px] text-grafito">
            La moderación de Parkit la va a revisar. Mientras tanto, la reseña sigue contando.
          </p>

          <label class="campo">
            <span class="label-campo">Motivo</span>
            <select name="motivo" [ngModel]="motivo()" (ngModelChange)="motivo.set($event)">
              @for (opcion of motivos; track opcion.valor) {
                <option [value]="opcion.valor">{{ opcion.etiqueta }}</option>
              }
            </select>
          </label>

          <label class="campo">
            <span class="label-campo">Detalle (opcional)</span>
            <textarea
              name="detalle"
              rows="3"
              class="rounded-control border border-borde bg-papel px-3.5 py-3 text-[14px] text-tinta
                     placeholder:text-humo focus:border-acento focus:outline-none"
              [maxLength]="detalleMax"
              placeholder="Contanos por qué la denunciás."
              [ngModel]="detalle()"
              (ngModelChange)="detalle.set($event)"
            ></textarea>
            <span class="campo-ayuda num-tabular">{{ detalle().length }}/{{ detalleMax }}</span>
          </label>

          @if (error(); as mensaje) {
            <p class="text-[13px] text-ocupada" role="alert">{{ mensaje }}</p>
          }

          <ui-boton tipo="submit" variante="primario" [bloque]="true" [cargando]="enviando()">
            Enviar denuncia
          </ui-boton>
        </form>
      }
    </ui-modal>
  `,
})
export class DenunciarResena {
  private readonly calificaciones = inject(CalificacionService);

  /** null = cerrado. */
  readonly calificacionId = input<Id | null>(null);
  readonly cerrado = output<void>();
  readonly denunciada = output<void>();
  /** Fallo la denuncia (p. ej. ya estaba denunciada): conviene recargar la lista. */
  readonly fallo = output<void>();

  protected readonly detalleMax = DETALLE_MAX;
  protected readonly motivos = Object.entries(TEXTO_MOTIVO_DENUNCIA).map(([valor, etiqueta]) => ({
    valor: valor as MotivoDenunciaResena,
    etiqueta,
  }));

  protected readonly motivo = signal<MotivoDenunciaResena>('OFENSIVA');
  protected readonly detalle = signal('');
  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected enviar(id: Id): void {
    if (this.enviando()) return;
    this.enviando.set(true);
    this.error.set(null);
    this.calificaciones.denunciar(id, this.motivo(), this.detalle()).subscribe({
      next: () => {
        this.enviando.set(false);
        this.limpiar();
        this.denunciada.emit();
      },
      error: (e: Error) => {
        this.enviando.set(false);
        this.error.set(e.message);
        this.fallo.emit();
      },
    });
  }

  protected cerrar(): void {
    this.limpiar();
    this.cerrado.emit();
  }

  private limpiar(): void {
    this.motivo.set('OFENSIVA');
    this.detalle.set('');
    this.error.set(null);
  }
}
