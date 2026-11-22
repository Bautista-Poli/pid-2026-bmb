import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Boton } from '../boton/boton';
import { Modal } from '../modal/modal';

/**
 * Modal de confirmacion para acciones que no se deshacen facil (dar de baja,
 * eliminar): un texto y los botones "Cancelar" y el de la accion.
 *
 * Es controlado, igual que `ui-modal`: quien lo usa maneja `abierto` y hace la
 * accion al recibir `confirmado`.
 *
 *   <ui-confirmar titulo="Eliminar A-01" boton="Eliminar" [abierto]="..." (confirmado)="..." (cerrado)="...">
 *     Se borra definitivamente.
 *   </ui-confirmar>
 */
@Component({
  selector: 'ui-confirmar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Boton, Modal],
  template: `
    <ui-modal [titulo]="titulo()" [abierto]="abierto()" (cerrado)="cerrado.emit()">
      <p class="text-[13.5px] leading-relaxed text-grafito"><ng-content /></p>
      <div class="flex justify-end gap-2">
        <ui-boton (presionado)="cerrado.emit()">Cancelar</ui-boton>
        <ui-boton variante="peligro" [cargando]="cargando()" (presionado)="confirmado.emit()">
          {{ boton() }}
        </ui-boton>
      </div>
    </ui-modal>
  `,
})
export class Confirmar {
  readonly titulo = input.required<string>();
  /** Texto del boton que hace la accion. */
  readonly boton = input('Confirmar');
  readonly abierto = input(false);
  /** Mientras viaja el pedido: spinner en el boton de la accion. */
  readonly cargando = input(false);

  readonly confirmado = output<void>();
  readonly cerrado = output<void>();
}
