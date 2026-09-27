import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  effect,
  input,
  output,
  viewChild,
} from '@angular/core';
import { Icono } from '../icono/icono';

let secuencia = 0;

/**
 * Ventana modal montada sobre `<dialog>`.
 *
 * Se apoya en lo que el navegador ya resuelve con `showModal()`: fondo inerte,
 * foco atrapado adentro, cierre con Escape y top layer (sin z-index ni bloqueo
 * manual del scroll). El contenido va por `<ng-content>`.
 *
 * Es controlado: `abierto` lo maneja quien lo usa, y cada cierre (Escape, la X
 * o el clic en el fondo) se avisa por `cerrado` para que apague su signal.
 */
@Component({
  selector: 'ui-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icono],
  template: `
    <dialog #dialogo class="modal" [attr.aria-labelledby]="idTitulo" (close)="cerrado.emit()">
      <div class="modal-panel">
        <div class="flex items-start justify-between gap-4">
          <h2 [id]="idTitulo" class="text-[16px] font-semibold text-tinta">{{ titulo() }}</h2>
          <button
            type="button"
            class="-m-1.5 rounded-boton p-1.5 text-plomo transition-colors duration-160
                   hover:bg-lienzo hover:text-tinta focus-visible:outline-2
                   focus-visible:outline-offset-2 focus-visible:outline-acento"
            aria-label="Cerrar"
            (click)="cerrado.emit()"
          >
            <ui-icono nombre="cerrar" [tamano]="18" />
          </button>
        </div>

        <ng-content />
      </div>
    </dialog>
  `,
  host: { '(click)': 'clicEnFondo($event)' },
})
export class Modal {
  readonly titulo = input.required<string>();
  readonly abierto = input(false);

  readonly cerrado = output<void>();

  private readonly dialogo = viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');

  protected readonly idTitulo = `modal-titulo-${secuencia++}`;

  constructor() {
    effect(() => {
      const dialogo = this.dialogo().nativeElement;
      if (this.abierto()) {
        if (!dialogo.open) dialogo.showModal();
      } else if (dialogo.open) {
        dialogo.close();
      }
    });
  }

  /**
   * El `<dialog>` ocupa solo el panel, pero el fondo tambien le llega como
   * click: si el destino es el propio dialogo (y no algo de adentro), el clic
   * fue afuera.
   */
  protected clicEnFondo(evento: MouseEvent): void {
    if (evento.target === this.dialogo().nativeElement) {
      this.cerrado.emit();
    }
  }
}
