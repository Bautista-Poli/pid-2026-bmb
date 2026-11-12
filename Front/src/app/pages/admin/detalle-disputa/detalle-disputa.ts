import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Boton, Cargando, EstadoVacio, Etiqueta } from '@app/components/ui';
import {
  ETIQUETA_ESTADO_INCIDENCIA,
  ETIQUETA_MOTIVO_RECLAMO,
  ETIQUETA_RESOLUCION,
  ETIQUETA_TIPO_INCIDENCIA,
} from '@app/models';
import { AdminService } from '@app/services/admin/admin.service';
import { ChatsDisputa } from './chats-disputa/chats-disputa';
import { ResolverDisputa } from './resolver-disputa/resolver-disputa';
import { ResumenDisputa } from './resumen-disputa/resumen-disputa';

/**
 * Pantalla `/admin/disputas/:incidenciaId` · rol ADMINISTRADOR
 *
 * Una incidencia denunciada: el resumen (lo pagado, lo devuelto, los horarios
 * reales), el chat entre las partes (solo lectura), los chats privados con
 * cada una y el formulario para resolver.
 */
@Component({
  selector: 'app-detalle-disputa',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ResumenDisputa, ChatsDisputa, ResolverDisputa, Boton, Cargando, EstadoVacio, Etiqueta, RouterLink, DatePipe],
  templateUrl: './detalle-disputa.html',
  styleUrl: './detalle-disputa.css',
})
export class DetalleDisputa {
  private readonly admin = inject(AdminService);

  /** Del path `/admin/disputas/:incidenciaId` (withComponentInputBinding). */
  readonly incidenciaId = input.required<string>();

  protected readonly etiquetaTipo = ETIQUETA_TIPO_INCIDENCIA;
  protected readonly etiquetaEstado = ETIQUETA_ESTADO_INCIDENCIA;
  protected readonly etiquetaMotivo = ETIQUETA_MOTIVO_RECLAMO;
  protected readonly etiquetaResolucion = ETIQUETA_RESOLUCION;
  protected readonly recurso = rxResource({
    params: () => this.incidenciaId(),
    stream: ({ params }) => this.admin.incidencia(params),
  });
}
