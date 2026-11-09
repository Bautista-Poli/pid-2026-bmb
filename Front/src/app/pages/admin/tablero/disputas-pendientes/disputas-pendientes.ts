import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Tarjeta } from '@app/components/ui';
import {
  ETIQUETA_MOTIVO_RECLAMO,
  ETIQUETA_TIPO_INCIDENCIA,
  EstadisticasAdmin,
  MotivoReclamo,
  TipoIncidencia,
} from '@app/models';
import { haceCuanto } from '@app/utils/tiempo.util';

/**
 * "Disputas pendientes" del tablero de admin (tablero.ts): cuantas esperan una
 * decision, las primeras y cuantos reclamos siguen entre las partes.
 */
@Component({
  selector: 'app-disputas-pendientes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Tarjeta],
  templateUrl: './disputas-pendientes.html',
  styleUrls: ['../compartido.css', './disputas-pendientes.css'],
  host: { style: 'display: contents' },
})
export class DisputasPendientes {
  readonly datos = input.required<EstadisticasAdmin>();

  protected readonly haceCuanto = haceCuanto;

  /** "Reclamo · No había cochera libre" o "Auto excedido". */
  protected tituloDisputa(tipo: string, motivo: string | null): string {
    const nombre = ETIQUETA_TIPO_INCIDENCIA[tipo as TipoIncidencia] ?? tipo;
    return motivo ? `${nombre} · ${ETIQUETA_MOTIVO_RECLAMO[motivo as MotivoReclamo] ?? motivo}` : nombre;
  }
}
