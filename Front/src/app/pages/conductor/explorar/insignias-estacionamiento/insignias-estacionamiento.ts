import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CodigoInsignia, ResumenReputacion, TEXTO_INSIGNIA, formatearNota } from '@app/models';
import { NivelEstacionamiento } from '@app/components/estacionamiento';

/** Estrella rellena (la de linea esta en `ui-icono`). */
const ESTRELLA = 'M12 3.8l2.5 5 5.5.8-4 3.9.9 5.5-4.9-2.6L7.1 19l.9-5.5-4-3.9 5.5-.8Z';

/**
 * Insignias y calificacion de un estacionamiento: el nivel (Cobre a
 * Diamante), las de categoria ("Impecable", "Seguro"...) y la nota
 * como cinco estrellas (llenas, media y vacias, redondeada a la media
 * estrella) con la cantidad de calificaciones: ★★★★⯪ (47). Sin
 * calificaciones no muestra nada.
 *
 * `modo`:
 *  - `completo`: todas las insignias y la nota (tarjeta del listado, detalle).
 *  - `compacto`: solo las estrellas de la nota (filas del mapa). El nivel lo
 *    pone quien lo usa al lado del nombre, separado de las estrellas.
 */
@Component({
  selector: 'app-insignias-estacionamiento',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NivelEstacionamiento],
  templateUrl: './insignias-estacionamiento.html',
  host: { class: 'contents' },
})
export class InsigniasEstacionamiento {
  readonly reputacion = input.required<ResumenReputacion>();
  readonly modo = input<'completo' | 'compacto'>('completo');

  protected readonly estrella = ESTRELLA;

  protected readonly visible = computed(
    () => this.reputacion().cantidad > 0 || (this.modo() === 'completo' && this.reputacion().nivel != null),
  );
  protected readonly nota = computed(() => formatearNota(this.reputacion().promedio));

  /** Cinco valores 1, 0.5 o 0: la nota redondeada a la media estrella (4,7 -> 4,5). */
  protected readonly estrellas = computed(() => {
    const mitades = Math.round((this.reputacion().promedio ?? 0) * 2);
    return [0, 1, 2, 3, 4].map((i) => Math.min(1, Math.max(0, (mitades - i * 2) / 2)));
  });
  protected readonly insignias = computed(() =>
    this.reputacion()
      .insignias.filter((codigo: CodigoInsignia) => codigo !== 'DESTACADO')
      .map((codigo: CodigoInsignia) => ({ codigo, texto: TEXTO_INSIGNIA[codigo] })),
  );
}
