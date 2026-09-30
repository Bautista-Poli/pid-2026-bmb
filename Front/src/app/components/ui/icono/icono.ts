import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Iconos disponibles. Se dibujan inline, sin libreria externa. */
export type NombreIcono =
  | 'explorar'
  | 'reservas'
  | 'auto'
  | 'moto'
  | 'tablero'
  | 'estacionamiento'
  | 'mas'
  | 'editar'
  | 'reloj'
  | 'perfil'
  | 'sol'
  | 'luna'
  | 'sistema'
  | 'cerrar'
  | 'cheuron'
  | 'intercambiar'
  | 'salida'
  | 'camioneta'
  | 'calendario'
  | 'menos'
  | 'ubicar'
  | 'navegar'
  | 'techo'
  | 'moneda'
  | 'buscar'
  | 'calle'
  | 'arbol'
  | 'ciudad'
  | 'esquina'
  | 'filtros'
  | 'inicio'
  | 'configuracion'
  | 'subir'
  | 'bajar'
  | 'derecha'
  | 'edificio';

/**
 * Icono de linea sobre un lienzo de 24x24. Todos comparten estilo (trazo de
 * 1.75, extremos redondeados) y heredan el color con `currentColor`, asi que se
 * tinta desde el contenedor igual que el texto. El tamaño sale de `[tamano]`.
 */
@Component({
  selector: 'ui-icono',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      [attr.width]="tamano()"
      [attr.height]="tamano()"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      @switch (nombre()) {
        @case ('explorar') {
          <path d="M12 21s6.5-5.4 6.5-10.5a6.5 6.5 0 1 0-13 0C5.5 15.6 12 21 12 21Z" />
          <circle cx="12" cy="10.5" r="2.4" />
        }
        @case ('reservas') {
          <rect x="3.5" y="5" width="17" height="15.5" rx="2.2" />
          <path d="M3.5 9.5h17" />
          <path d="M8 3.5v3.2M16 3.5v3.2" />
          <path d="M8.8 14.7l2.1 2.1 4.3-4.3" />
        }
        @case ('auto') {
          <path d="M5 11.2l1.4-4A2 2 0 0 1 8.3 5.8h7.4a2 2 0 0 1 1.9 1.4l1.4 4" />
          <path
            d="M4 11.2h16a1.5 1.5 0 0 1 1.5 1.5V16a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1v-3.3a1.5 1.5 0 0 1 1.5-1.5Z"
          />
          <circle cx="7.3" cy="16.2" r="1.6" />
          <circle cx="16.7" cy="16.2" r="1.6" />
        }
        @case ('moto') {
          <circle cx="5.6" cy="16.9" r="3.3" />
          <circle cx="18.4" cy="16.9" r="3.3" />
          <path d="M5.6 16.9 9.4 11h5l4 5.9" />
          <path d="M9.4 11 7.9 8.3h3.2" />
          <path d="M14.4 11l2.6-2.7h2.3" />
        }
        @case ('cerrar') {
          <path d="M6.6 6.6l10.8 10.8M17.4 6.6L6.6 17.4" />
        }
        @case ('cheuron') {
          <path d="M6.5 9.4 12 14.9l5.5-5.5" />
        }
        @case ('intercambiar') {
          <path d="M7.4 4.6 3.9 8.1l3.5 3.5M3.9 8.1h12.4M16.6 19.4l3.5-3.5-3.5-3.5M20.1 15.9H7.7" />
        }
        @case ('salida') {
          <path d="M14.6 7.4V5.2a1.7 1.7 0 0 0-1.7-1.7H5.6a1.7 1.7 0 0 0-1.7 1.7v13.6a1.7 1.7 0 0 0 1.7 1.7h7.3a1.7 1.7 0 0 0 1.7-1.7v-2.2" />
          <path d="M9.6 12h10.5m0 0-3.2-3.2M20.1 12l-3.2 3.2" />
        }
        @case ('tablero') {
          <rect x="3.5" y="3.5" width="7.2" height="7.2" rx="1.4" />
          <rect x="13.3" y="3.5" width="7.2" height="7.2" rx="1.4" />
          <rect x="3.5" y="13.3" width="7.2" height="7.2" rx="1.4" />
          <rect x="13.3" y="13.3" width="7.2" height="7.2" rx="1.4" />
        }
        @case ('estacionamiento') {
          <rect x="3.8" y="3.8" width="16.4" height="16.4" rx="3.4" />
          <path d="M9.5 16.5V7.8h3.1a2.85 2.85 0 0 1 0 5.7H9.5" />
        }
        @case ('mas') {
          <path d="M12 5.2v13.6M5.2 12h13.6" />
        }
        @case ('editar') {
          <path
            d="M14.5 5.7l3.8 3.8M4 20l4.2-.9L19 8.3a2 2 0 0 0 0-2.8l-.5-.5a2 2 0 0 0-2.8 0L4.9 15.8 4 20Z"
          />
        }
        @case ('reloj') {
          <circle cx="12" cy="12" r="8.2" />
          <path d="M12 7.4V12l3 1.8" />
        }
        @case ('perfil') {
          <circle cx="12" cy="8.3" r="3.8" />
          <path d="M4.8 20.2c.9-3.6 3.7-5.6 7.2-5.6s6.3 2 7.2 5.6" />
        }
        @case ('sol') {
          <circle cx="12" cy="12" r="4" />
          <path
            d="M12 2.6v2.2M12 19.2v2.2M4.4 4.4l1.6 1.6M18 18l1.6 1.6M2.6 12h2.2M19.2 12h2.2M4.4 19.6l1.6-1.6M18 6l1.6-1.6"
          />
        }
        @case ('luna') {
          <path d="M20.6 14.2A8.6 8.6 0 0 1 9.8 3.4a8.6 8.6 0 1 0 10.8 10.8Z" />
        }
        @case ('sistema') {
          <rect x="2.8" y="4.4" width="18.4" height="12" rx="2" />
          <path d="M8.6 19.6h6.8M12 16.4v3.2" />
        }
        @case ('camioneta') {
          <path d="M2.5 15.8V8.6a1.1 1.1 0 0 1 1.1-1.1h9.2v8.3" />
          <path d="M12.8 10.3h4.1a1.5 1.5 0 0 1 1.2.6l2.9 3.8v1.1a1 1 0 0 1-1 1H2.5" />
          <circle cx="7" cy="17.1" r="1.7" />
          <circle cx="17.1" cy="17.1" r="1.7" />
        }
        @case ('calendario') {
          <rect x="3.5" y="5" width="17" height="15.5" rx="2.2" />
          <path d="M3.5 9.5h17M8 3.5v3.2M16 3.5v3.2" />
        }
        @case ('menos') {
          <path d="M5.2 12h13.6" />
        }
        @case ('ubicar') {
          <circle cx="12" cy="12" r="6.4" />
          <circle cx="12" cy="12" r="2.1" />
          <path d="M12 2.6v3M12 18.4v3M2.6 12h3M18.4 12h3" />
        }
        @case ('navegar') {
          <path d="M20.2 3.8 3.9 10.6l7 2.5 2.5 7 6.8-16.3Z" />
        }
        @case ('techo') {
          <path d="M3.5 11.2 12 4.5l8.5 6.7" />
          <path d="M5.8 9.6v9.9h12.4V9.6" />
          <path d="M9.6 19.5v-5.2h4.8v5.2" />
        }
        @case ('moneda') {
          <circle cx="12" cy="12" r="8.2" />
          <path d="M14.6 9.2c-.4-.9-1.4-1.4-2.6-1.4-1.5 0-2.6.8-2.6 2s1.1 1.7 2.6 2c1.5.3 2.6.8 2.6 2s-1.1 2-2.6 2c-1.2 0-2.2-.5-2.6-1.4M12 6.3v1.5M12 16.2v1.5" />
        }
        @case ('buscar') {
          <circle cx="10.8" cy="10.8" r="6.3" />
          <path d="m15.5 15.5 4.4 4.4" />
        }
        @case ('calle') {
          <path d="M8.2 3.5 5.4 20.5M15.8 3.5l2.8 17" />
          <path d="M12 4.5v2.6M12 10.7v2.6M12 16.9v2.6" />
        }
        @case ('arbol') {
          <path d="M12 21v-6.2" />
          <path d="M12 14.8c3.9 0 6.4-2.1 6.4-5.1 0-2.6-2-4.6-4.3-5-.6-1-1.3-1.2-2.1-1.2s-1.5.2-2.1 1.2c-2.3.4-4.3 2.4-4.3 5 0 3 2.5 5.1 6.4 5.1Z" />
          <path d="M9.4 21h5.2" />
        }
        @case ('ciudad') {
          <path d="M3.5 20.5h17" />
          <path d="M5.5 20.5V9.4l5-2.4v13.5" />
          <path d="M10.5 20.5V4.2l8 3.3v13" />
          <path d="M13.4 9.2h2.2M13.4 12.4h2.2M13.4 15.6h2.2M7.5 12.4h1M7.5 15.6h1" />
        }
        @case ('esquina') {
          <path d="M9 3.5v17M15 3.5v17M3.5 9h17M3.5 15h17" />
          <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
        }
        @case ('inicio') {
          <path d="M3.8 10.4 12 3.8l8.2 6.6" />
          <path d="M5.8 8.9v10.3a1 1 0 0 0 1 1h3.4v-5.6h3.6v5.6h3.4a1 1 0 0 0 1-1V8.9" />
        }
        @case ('configuracion') {
          <path
            d="M12.22 2.5h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73v.18a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4.5a2 2 0 0 0-2-2Z"
          />
          <circle cx="12" cy="12" r="3" />
        }
        @case ('subir') {
          <path d="M12 19V5.5M6.5 11 12 5.5l5.5 5.5" />
        }
        @case ('bajar') {
          <path d="M12 5v13.5M6.5 13l5.5 5.5 5.5-5.5" />
        }
        @case ('derecha') {
          <path d="M9.4 6.5 14.9 12l-5.5 5.5" />
        }
        @case ('edificio') {
          <rect x="5" y="3.5" width="14" height="17" rx="1.6" />
          <path d="M9 7.5h1.5M13.5 7.5H15M9 11h1.5M13.5 11H15M9 14.5h1.5M13.5 14.5H15" />
          <path d="M10.5 20.5v-2.6h3v2.6" />
        }
        @case ('filtros') {
          <path d="M4 7h9.5M17.5 7H20M4 17h2.5M10.5 17H20" />
          <circle cx="15.5" cy="7" r="2" />
          <circle cx="8.5" cy="17" r="2" />
        }
      }
    </svg>
  `,
  host: { class: 'inline-flex shrink-0' },
})
export class Icono {
  readonly nombre = input.required<NombreIcono>();
  readonly tamano = input(20);
}
