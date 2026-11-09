import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NivelEstacionamiento } from '@app/components/estacionamiento';
import { Tarjeta } from '@app/components/ui';
import { ReputacionEstacionamiento } from '@app/models';

/**
 * La escalera de niveles de Reputacion (reputacion.ts), de Cobre a Diamante:
 * el actual, los alcanzados y cuanto falta para el siguiente.
 */
@Component({
  selector: 'app-niveles-reputacion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NivelEstacionamiento, Tarjeta],
  templateUrl: './niveles-reputacion.html',
  styleUrls: ['../compartido.css', './niveles-reputacion.css'],
  host: { style: 'display: contents' },
})
export class NivelesReputacion {
  readonly datos = input.required<ReputacionEstacionamiento>();

  /** "80 a 87" / "95 o más" */
  protected rango(indice: number): string {
    const datos = this.datos();
    const actual = datos.niveles[indice];
    const siguiente = datos.niveles[indice + 1];
    return siguiente ? `${actual.desde} a ${siguiente.desde - 1}` : `${actual.desde} o más`;
  }

  /** Si ese nivel ya quedo atras (o es el actual). Sin nivel, ninguno. */
  protected alcanzado(indice: number): boolean {
    const datos = this.datos();
    if (!datos.nivel) return false;
    return indice <= datos.niveles.findIndex((n) => n.codigo === datos.nivel);
  }
}
