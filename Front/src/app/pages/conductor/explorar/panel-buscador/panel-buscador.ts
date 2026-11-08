import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icono } from '@app/components/ui';
import { ICONO_TIPO_VEHICULO, Vehiculo, descripcionVehiculo } from '@app/models';
import { Observable } from 'rxjs';
import { CampoBusqueda, Sugerencia } from '../campo-busqueda/campo-busqueda';

/**
 * Panel de arriba de Explorar (mapa.ts): buscador de destino, boton "mi
 * ubicacion", selector de vehiculo y boton "Filtrar".
 *
 * Solo muestra y avisa: el destino, el vehiculo elegido y los filtros los
 * guarda la pantalla, porque de ahi salen las distancias, el mapa y los resultados.
 */
@Component({
  selector: 'app-panel-buscador',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icono, CampoBusqueda],
  templateUrl: './panel-buscador.html',
  styleUrl: './panel-buscador.css',
})
export class PanelBuscador {
  /** Lo escrito en el buscador. */
  readonly texto = input('');
  /** Sugerencias para lo escrito (barrios y estacionamientos). */
  readonly buscarSugerencias = input.required<(texto: string) => Observable<Sugerencia[]>>();
  /** Vehiculo elegido; `null` si el conductor no cargo ninguno. */
  readonly vehiculo = input<Vehiculo | null>(null);
  /** Con un solo vehiculo las flechas quedan deshabilitadas. */
  readonly variosVehiculos = input(false);
  /** Cuantos filtros estan en uso (se muestra en el boton "Filtrar"). */
  readonly filtrosActivos = input(0);
  /** Sin ubicacion ni destino: se muestra el aviso para activar la ubicacion. */
  readonly sinOrigen = input(false);

  /** Cada cambio de lo escrito. */
  readonly textoCambiado = output<string>();
  /** Enter sin elegir una sugerencia. */
  readonly textoBuscado = output<void>();
  readonly destinoElegido = output<Sugerencia>();
  readonly ubicacionPedida = output<void>();
  readonly vehiculoAnterior = output<void>();
  readonly vehiculoSiguiente = output<void>();
  readonly filtrosPedidos = output<void>();

  protected readonly iconoTipo = ICONO_TIPO_VEHICULO;
  protected readonly descripcion = descripcionVehiculo;
}
