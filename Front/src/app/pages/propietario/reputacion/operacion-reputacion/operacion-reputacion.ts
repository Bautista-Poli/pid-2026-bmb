import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Tarjeta } from '@app/components/ui';
import { ReputacionEstacionamiento } from '@app/models';

interface FilaOperacion {
  titulo: string;
  valor: string;
  detalle: string;
  puntos: number;
}

/**
 * La parte de Reputacion (reputacion.ts) que mide Parkit: confirmaciones a
 * tiempo, incidencias, respuesta en el chat y cancelaciones, 10 puntos cada una.
 */
@Component({
  selector: 'app-operacion-reputacion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Tarjeta],
  templateUrl: './operacion-reputacion.html',
  styleUrls: ['../compartido.css', './operacion-reputacion.css'],
  host: { style: 'display: contents' },
})
export class OperacionReputacion {
  readonly datos = input.required<ReputacionEstacionamiento>();

  protected readonly filasOperacion = computed<FilaOperacion[]>(() => {
    const datos = this.datos();
    const { confirmacion, incidencias, respuesta, cancelaciones } = datos.operacion;
    return [
      {
        titulo: 'Confirmadas a tiempo',
        valor: `${confirmacion.porcentaje}%`,
        detalle:
          confirmacion.vencidas === 0
            ? 'Ninguna vencida sin confirmar'
            : `${confirmacion.vencidas} de ${confirmacion.reservas} vencieron sin confirmar`,
        puntos: confirmacion.puntos,
      },
      {
        titulo: 'Incidencias sin denuncia',
        valor: incidencias.total === 0 ? '—' : `${incidencias.sinDenuncia} de ${incidencias.total}`,
        detalle: incidencias.total === 0 ? 'No hubo incidencias' : 'Se arreglaron en el chat',
        puntos: incidencias.puntos,
      },
      {
        titulo: 'Respuesta en el chat',
        valor: respuesta.minutos == null ? '—' : `${respuesta.minutos} min`,
        detalle:
          respuesta.minutos == null
            ? 'Sin incidencias para responder'
            : respuesta.minutos <= 10
              ? 'Respondés rápido'
              : 'Respondé en menos de 10 min para sumar todo',
        puntos: respuesta.puntos,
      },
      {
        titulo: 'Cancelaciones propias',
        valor: String(cancelaciones.propias),
        detalle: cancelaciones.propias === 0 ? 'No cancelaste reservas' : 'Cada cancelación tuya resta',
        puntos: cancelaciones.puntos,
      },
    ];
  });
}
