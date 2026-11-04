import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CodigoInsignia, ResumenReputacion, TEXTO_INSIGNIA, formatearNota } from '@app/models';

/** Estrella rellena (la de linea esta en `ui-icono`). */
const ESTRELLA = 'M12 3.8l2.5 5 5.5.8-4 3.9.9 5.5-4.9-2.6L7.1 19l.9-5.5-4-3.9 5.5-.8Z';

/**
 * Insignias y calificacion de un estacionamiento: la pastilla dorada de
 * "Anfitrion destacado", las de categoria ("Impecable", "Seguro"...) y la nota
 * como cinco estrellas (llenas, media y vacias, redondeada a la media
 * estrella) con la cantidad de calificaciones: ★★★★⯪ (47). Sin
 * calificaciones no muestra nada.
 *
 * `modo`:
 *  - `completo`: todas las insignias y la nota (tarjeta del listado, detalle).
 *  - `compacto`: solo las estrellas de la nota (filas del mapa). El "destacado"
 *    lo pone quien lo usa al lado del nombre: junto a las estrellas se
 *    confundiria con una estrella mas.
 */
@Component({
  selector: 'app-insignias-estacionamiento',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      <span class="flex flex-wrap items-center gap-1.5">
        @if (modo() === 'completo') {
          @for (insignia of insignias(); track insignia.codigo) {
            <span
              class="inline-flex items-center gap-1 rounded-etiqueta px-[7px] py-[3px] text-[11px] font-semibold"
              [class]="insignia.codigo === 'DESTACADO' ? 'bg-oro-suave text-oro-tinta' : 'bg-acento-suave text-acento-fuerte'"
            >
              @if (insignia.codigo === 'DESTACADO') {
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path [attr.d]="estrella" /></svg>
              }
              {{ insignia.texto }}
            </span>
          }
        }
        @if (reputacion().promedio != null) {
          <span
            class="inline-flex items-center gap-1 text-[12px] font-medium text-plomo"
            role="img"
            [attr.aria-label]="'Calificación ' + nota() + ' de 5, ' + reputacion().cantidad + ' opiniones'"
            [attr.title]="nota() + ' de 5'"
          >
            <span class="inline-flex" aria-hidden="true">
              @for (relleno of estrellas(); track $index) {
                <!-- Contorno gris y, encima, la parte dorada recortada al ancho del relleno. -->
                <span class="relative inline-flex size-[13px]">
                  <svg viewBox="0 0 24 24" class="size-full text-humo/40" fill="currentColor"><path [attr.d]="estrella" /></svg>
                  @if (relleno > 0) {
                    <span class="absolute inset-y-0 left-0 overflow-hidden" [style.width.%]="relleno * 100">
                      <svg viewBox="0 0 24 24" class="size-[13px] max-w-none text-oro" fill="currentColor"><path [attr.d]="estrella" /></svg>
                    </span>
                  }
                </span>
              }
            </span>
            <span class="num-tabular" aria-hidden="true">({{ reputacion().cantidad }})</span>
          </span>
        }
      </span>
    }
  `,
  host: { class: 'contents' },
})
export class InsigniasEstacionamiento {
  readonly reputacion = input.required<ResumenReputacion>();
  readonly modo = input<'completo' | 'compacto'>('completo');

  protected readonly estrella = ESTRELLA;

  protected readonly visible = computed(
    () => this.reputacion().cantidad > 0 || (this.modo() === 'completo' && this.reputacion().destacado),
  );
  protected readonly nota = computed(() => formatearNota(this.reputacion().promedio));

  /** Cinco valores 1, 0.5 o 0: la nota redondeada a la media estrella (4,7 -> 4,5). */
  protected readonly estrellas = computed(() => {
    const mitades = Math.round((this.reputacion().promedio ?? 0) * 2);
    return [0, 1, 2, 3, 4].map((i) => Math.min(1, Math.max(0, (mitades - i * 2) / 2)));
  });
  protected readonly insignias = computed(() =>
    this.reputacion().insignias.map((codigo: CodigoInsignia) => ({ codigo, texto: TEXTO_INSIGNIA[codigo] })),
  );
}
