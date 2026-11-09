import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Tarjeta } from '@app/components/ui';
import {
  EtiquetaCalificacion,
  Id,
  ReputacionEstacionamiento,
  TEXTO_ESTADO_DENUNCIA,
  TEXTO_ETIQUETA,
  formatearNota,
} from '@app/models';

const FECHA_CORTA = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' });

/** "hace 2 días", "hace 3 h", "12 oct". */
function haceCuanto(instante: string, ahora = Date.now()): string {
  const minutos = Math.max(0, Math.round((ahora - Date.parse(instante)) / 60_000));
  if (minutos < 60) return minutos <= 1 ? 'recién' : `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.round(horas / 24);
  if (dias < 7) return dias === 1 ? 'ayer' : `hace ${dias} días`;
  return FECHA_CORTA.format(new Date(instante)).replace('.', '');
}

/**
 * Opiniones recientes en Reputacion (reputacion.ts): autor, nota, comentario y
 * etiquetas. Cada una se puede denunciar (`denunciar`, con el id de la calificacion).
 */
@Component({
  selector: 'app-opiniones-reputacion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Tarjeta],
  templateUrl: './opiniones-reputacion.html',
  styleUrls: ['../compartido.css', './opiniones-reputacion.css'],
  host: { style: 'display: contents' },
})
export class OpinionesReputacion {
  readonly datos = input.required<ReputacionEstacionamiento>();

  readonly denunciar = output<Id>();

  protected readonly nota = formatearNota;
  protected readonly haceCuanto = haceCuanto;
  protected readonly textoEstadoDenuncia = TEXTO_ESTADO_DENUNCIA;

  protected textoDeEtiqueta(codigo: EtiquetaCalificacion): string {
    return TEXTO_ETIQUETA[codigo];
  }
}
