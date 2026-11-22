import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Chip } from '@app/components/ui';

export type Pestania = 'PROXIMAS' | 'EN_CURSO' | 'HISTORIAL';

/** Las pestañas, en el orden en que se muestran. */
const PESTANIAS: { clave: Pestania; titulo: string }[] = [
  { clave: 'PROXIMAS', titulo: 'Próximas' },
  { clave: 'EN_CURSO', titulo: 'En curso' },
  { clave: 'HISTORIAL', titulo: 'Historial' },
];

/**
 * Menu de pestañas de "Mis reservas": Próximas / En curso / Historial, cada
 * una con su contador. No guarda estado: la pestaña activa la maneja la pantalla.
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
  /** Cuantas reservas hay en cada pestaña. */
  readonly cantidades = input.required<Record<Pestania, number>>();
  /** Mientras cargan las reservas no hay numeros que mostrar: se ocultan los contadores. */
  readonly cargando = input(false);

  readonly cambiar = output<Pestania>();

  protected readonly pestanias = PESTANIAS;
}
