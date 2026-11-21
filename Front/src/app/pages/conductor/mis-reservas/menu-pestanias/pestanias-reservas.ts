import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Chip } from '@app/components/ui';

export type Pestania = 'VIGENTES' | 'HISTORIAL';

/**
 * Menu de pestañas de "Mis reservas": Vigentes / Historial, cada una con su
 * contador. No guarda estado: la pestaña activa la maneja la pantalla.
 */
@Component({
  selector: 'app-pestanias-reservas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Chip],
  templateUrl: './pestanias-reservas.html',
  styleUrl: './pestanias-reservas.css',
})
export class PestaniasReservas {
  readonly activa = input.required<Pestania>();
  readonly cantidadVigentes = input(0);
  readonly cantidadHistorial = input(0);
  /** Mientras cargan las reservas no hay numeros que mostrar: se ocultan los contadores. */
  readonly cargando = input(false);

  readonly cambiar = output<Pestania>();
}
