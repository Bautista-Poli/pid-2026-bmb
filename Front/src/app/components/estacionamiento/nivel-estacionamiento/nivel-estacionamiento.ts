import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CodigoNivel, NOMBRE_NIVEL } from '@app/models';

/**
 * Pastilla del nivel de reputacion (Cobre, Plata, Oro, Platino, Esmeralda,
 * Diamante) con una gema del color del nivel. Los colores, claro y oscuro,
 * estan en styles.css (`.nivel--*`).
 */
@Component({
  selector: 'app-nivel-estacionamiento',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="nivel"
      [class]="'nivel--' + nivel().toLowerCase()"
      [class.nivel--grande]="tamano() === 'grande'"
      [attr.title]="'Nivel ' + nombre()"
    >
      <svg class="nivel__gema" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 3.5h10l4 5.5-9 11.5L3 9z" fill="currentColor" />
        <path d="M3 9h18M9.5 3.5 8 9l4 11.5L16 9l-1.5-5.5" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.2" stroke-linejoin="round" />
      </svg>
      {{ etiqueta() }}
    </span>
  `,
  host: { class: 'contents' },
})
export class NivelEstacionamiento {
  readonly nivel = input.required<CodigoNivel>();
  readonly tamano = input<'chico' | 'grande'>('chico');
  /** "Oro" o, con `conPalabra`, "Nivel Oro". */
  readonly conPalabra = input(false);

  protected readonly nombre = computed(() => NOMBRE_NIVEL[this.nivel()]);
  protected readonly etiqueta = computed(() => (this.conPalabra() ? `Nivel ${this.nombre()}` : this.nombre()));
}
