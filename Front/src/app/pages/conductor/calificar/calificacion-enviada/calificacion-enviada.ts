import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Boton } from '@app/components/ui';

/** El "¡Gracias por calificar!" de Calificar (calificar.ts), con la nota que dio. */
@Component({
  selector: 'app-calificacion-enviada',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Boton, RouterLink],
  templateUrl: './calificacion-enviada.html',
  styleUrl: './calificacion-enviada.css',
})
export class CalificacionEnviada {
  /** El promedio ya formateado ("4,2"). */
  readonly promedio = input.required<string>();
  /** Nombre del estacionamiento. */
  readonly estacionamiento = input.required<string>();
}
