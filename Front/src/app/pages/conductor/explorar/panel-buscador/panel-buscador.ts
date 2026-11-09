import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icono, NombreIcono } from '@app/components/ui';
import { Estacionamiento, ICONO_TIPO_VEHICULO, Vehiculo, descripcionVehiculo } from '@app/models';
import { Destino, TipoLugar } from '@app/utils/direcciones.util';
import { buscarDestinosLocales } from '@app/utils/destinos-locales.util';
import { Observable, of } from 'rxjs';
import { CampoBusqueda, Sugerencia } from './campo-busqueda/campo-busqueda';

/** Sugerencias que muestra el buscador como maximo. */
const MAX_SUGERENCIAS = 8;

/** Icono de cada sugerencia del buscador, segun que clase de lugar es. */
const ICONO_LUGAR: Record<TipoLugar, NombreIcono> = {
  direccion: 'explorar',
  esquina: 'esquina',
  calle: 'calle',
  zona: 'explorar',
  ciudad: 'ciudad',
  plaza: 'arbol',
  lugar: 'estacionamiento',
};

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
  /** Estacionamientos publicados: de ahi salen las sugerencias (sus barrios y nombres). */
  readonly estacionamientos = input<Estacionamiento[]>([]);
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
  /** Zona, direccion o estacionamiento elegido de las sugerencias. */
  readonly destinoElegido = output<Destino>();
  readonly ubicacionPedida = output<void>();
  readonly vehiculoAnterior = output<void>();
  readonly vehiculoSiguiente = output<void>();
  readonly filtrosPedidos = output<void>();

  protected readonly iconoTipo = ICONO_TIPO_VEHICULO;
  protected readonly descripcion = descripcionVehiculo;

  /**
   * Sugerencias del buscador (desde la 3ra letra): los barrios y los
   * estacionamientos que ya estan en la base (buscarDestinosLocales).
   */
  protected readonly buscarSugerencias = (texto: string): Observable<Sugerencia<Destino>[]> =>
    of(
      buscarDestinosLocales(texto, this.estacionamientos())
        .slice(0, MAX_SUGERENCIAS)
        .map((lugar) => ({
          nombre: lugar.nombre,
          detalle: lugar.detalle,
          dato: lugar,
          icono: ICONO_LUGAR[lugar.tipo ?? 'lugar'],
        })),
    );

  /** Las sugerencias siempre traen su destino en `dato` (ver `buscarSugerencias`). */
  protected elegir(sugerencia: Sugerencia): void {
    this.destinoElegido.emit(sugerencia.dato as Destino);
  }
}
