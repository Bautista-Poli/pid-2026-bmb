import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Animacion de "reserva hecha" para la pantalla de confirmacion.
 *
 * Un cursor entra y aprieta "Reservar"; el boton se cierra en un circulo verde
 * y se dibuja el tilde. Dura ~1,3 s y se reproduce una vez. Es CSS puro: con
 * `prefers-reduced-motion` la regla global lleva cada animacion a su estado
 * final, asi que se ve directo el circulo con el tilde.
 */
@Component({
  selector: 'app-reserva-hecha',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="escena" aria-hidden="true">
      <div class="boton">
        <span class="texto">Reservar</span>
        <svg class="tilde" viewBox="0 0 24 24">
          <path d="m6.5 12.5 3.7 3.7 7.3-8" pathLength="1" />
        </svg>
      </div>

      <span class="chispas">
        @for (angulo of chispas; track angulo) {
          <i [style.rotate.deg]="angulo"></i>
        }
      </span>

      <svg class="cursor" viewBox="0 0 24 24">
        <path d="M5 3.5v15.2l4.1-3.9 2.6 5.7 2.7-1.2-2.6-5.6h5.7L5 3.5Z" />
      </svg>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .escena {
      position: relative;
      width: 150px;
      height: 48px;
    }

    .boton {
      position: absolute;
      inset: 0 auto 0 0;
      display: grid;
      place-items: center;
      width: 124px;
      overflow: hidden;
      border-radius: 999px;
      background: var(--color-acento);
      color: var(--color-sobre-acento);
      animation:
        presionar 150ms 420ms ease-out,
        colapsar 360ms 560ms var(--ease-suave) forwards,
        rebote 260ms 920ms var(--ease-suave);
    }

    .texto {
      grid-area: 1 / 1;
      font-size: 14px;
      font-weight: 600;
      white-space: nowrap;
      animation: desvanecer 120ms 520ms ease-out forwards;
    }

    .tilde {
      grid-area: 1 / 1;
      width: 24px;
      height: 24px;
      fill: none;
      stroke: #fff;
      stroke-width: 2.4;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .tilde path {
      stroke-dasharray: 1;
      stroke-dashoffset: 1;
      animation: dibujar 280ms 860ms ease-out forwards;
    }

    /* Centradas sobre el circulo final (48 x 48). */
    .chispas {
      position: absolute;
      top: 24px;
      left: 24px;
    }

    .chispas i {
      position: absolute;
      top: -1px;
      left: 0;
      width: 7px;
      height: 2px;
      border-radius: 2px;
      background: var(--color-exito);
      transform-origin: 0 50%;
      opacity: 0;
      animation: chispa 420ms 900ms ease-out;
    }

    .cursor {
      position: absolute;
      top: 20px;
      left: 72px;
      width: 22px;
      height: 22px;
      fill: var(--color-papel);
      stroke: var(--color-tinta);
      stroke-width: 1.4;
      stroke-linejoin: round;
      opacity: 0;
      animation: cursor 1000ms var(--ease-suave) forwards;
    }

    /* La regla global acorta la duracion; aca tambien saco las esperas. */
    @media (prefers-reduced-motion: reduce) {
      * {
        animation-delay: 0ms !important;
      }
    }

    @keyframes cursor {
      0% {
        opacity: 0;
        transform: translate(34px, 26px);
      }
      38% {
        opacity: 1;
        transform: none;
      }
      45% {
        transform: scale(0.8);
      }
      55% {
        opacity: 1;
        transform: none;
      }
      100% {
        opacity: 0;
        transform: translate(10px, 8px);
      }
    }

    @keyframes presionar {
      50% {
        transform: scale(0.94);
      }
    }

    @keyframes colapsar {
      to {
        width: 48px;
        background: var(--color-exito);
      }
    }

    @keyframes rebote {
      50% {
        transform: scale(1.08);
      }
    }

    @keyframes desvanecer {
      to {
        opacity: 0;
      }
    }

    @keyframes dibujar {
      to {
        stroke-dashoffset: 0;
      }
    }

    @keyframes chispa {
      0% {
        opacity: 0;
        transform: translateX(26px) scaleX(0.4);
      }
      30% {
        opacity: 1;
      }
      100% {
        opacity: 0;
        transform: translateX(36px) scaleX(1);
      }
    }
  `,
})
export class ReservaHecha {
  protected readonly chispas = [0, 45, 90, 135, 180, 225, 270, 315];
}
