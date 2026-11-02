import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { CalificacionRecibida } from '@app/models';

/** Calificaciones recibidas, sin autor: estrellas, comentario y fecha. */
@Component({
  selector: 'app-lista-calificaciones',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe],
  template: `
    @if (calificaciones().length === 0) {
      <p class="text-[13.5px] text-grafito">Todavía no hay calificaciones.</p>
    } @else {
      <ul class="flex flex-col divide-y divide-borde">
        @for (c of calificaciones(); track $index) {
          <li class="flex flex-col gap-1 py-3">
            <div class="flex items-center justify-between gap-3">
              <span class="text-acento tracking-wide" [attr.aria-label]="c.puntaje + ' de 5 estrellas'">
                {{ '★'.repeat(c.puntaje) }}<span class="text-humo">{{ '★'.repeat(5 - c.puntaje) }}</span>
              </span>
              <span class="text-[12px] text-humo">{{ c.creadaEn | date: 'd MMM y' }}</span>
            </div>
            @if (c.comentario) {
              <p class="text-[13.5px] text-tinta">{{ c.comentario }}</p>
            }
          </li>
        }
      </ul>
    }
  `,
})
export class ListaCalificaciones {
  readonly calificaciones = input.required<CalificacionRecibida[]>();
}
