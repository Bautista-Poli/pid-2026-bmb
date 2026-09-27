import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Marca de Parkit para lugares chicos (sidebar, header mobile): la insignia
 * dibujada inline en los colores de la marca —azul de la "P" y verde del
 * check— mas el wordmark opcional "parkit". El logo completo en PNG
 * (`public/logo-parkit.png`) se usa en las pantallas de ingreso y registro.
 */
@Component({
  selector: 'ui-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="inline-flex items-center gap-2">
      <svg
        [attr.width]="tamano()"
        [attr.height]="tamano()"
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden="true"
      >
        <rect x="1" y="1" width="30" height="30" rx="9" fill="var(--color-acento)" />
        <!-- La "P" del cartel de estacionamiento -->
        <path
          d="M11.6 23.5V8.5h5a4.1 4.1 0 0 1 0 8.2h-5"
          fill="none"
          stroke="var(--color-sobre-acento)"
          stroke-width="2.4"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <!-- Insignia con el check verde de la marca -->
        <circle cx="24" cy="24" r="6.4" fill="var(--color-exito)" stroke="var(--color-papel)" stroke-width="2" />
        <path
          d="M21.4 24.1l1.7 1.7 3.3-3.5"
          fill="none"
          stroke="var(--color-sobre-acento)"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>

      @if (mostrarTexto()) {
        <span class="text-[16px] leading-none font-semibold tracking-[-0.02em]">
          <span [style.color]="'var(--color-acento)'">park</span><span
            [style.color]="'var(--color-exito)'"
            >it</span
          >
        </span>
      }
    </span>
  `,
  host: { class: 'inline-flex' },
})
export class Logo {
  readonly tamano = input(28);
  readonly mostrarTexto = input(true);
}
