import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { Observable } from 'rxjs';
import {
  ETIQUETA_TIPO_VEHICULO,
  FiltrosEstacionamiento as Filtros,
  TipoVehiculo,
} from '@app/models';
import { CampoBusqueda, Chip, Sugerencia } from '@app/components/ui';
import { DireccionGeoref } from '@app/services/georef.service';

/** Orden de los chips segun el diseno. */
const TIPOS: TipoVehiculo[] = ['AUTO', 'MOTO', 'CAMIONETA'];

/**
 * Buscador + filtro por tipo de vehiculo.
 * El tipo es de seleccion unica obligatoria (siempre hay uno activo).
 *
 * El buscador hace dos cosas: lo que se escribe filtra por nombre o zona, y si
 * es una direccion ("Pueyrredon 2409") sugiere direcciones reales. Elegir una la
 * vuelve el `destino`: se deja de filtrar por texto y quien usa el componente
 * mide las distancias desde ahi. Escribir de nuevo quita el destino.
 */
@Component({
  selector: 'app-filtros-estacionamiento',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CampoBusqueda, Chip],
  templateUrl: './filtros-estacionamiento.html',
  host: { class: 'block' },
})
export class FiltrosEstacionamiento {
  readonly filtros = model.required<Filtros>();
  readonly destino = model<DireccionGeoref | null>(null);
  /** Sugerencias de direcciones para el buscador. Sin esto, solo filtra por texto. */
  readonly buscarDestinos = input<((texto: string) => Observable<Sugerencia[]>) | null>(null);

  protected readonly tipos = TIPOS;
  protected readonly etiquetaTipo = ETIQUETA_TIPO_VEHICULO;

  /** Con un destino elegido el campo muestra su direccion; si no, lo escrito. */
  protected readonly textoBusqueda = computed(
    () => this.destino()?.nombre ?? this.filtros().busqueda ?? '',
  );

  protected actualizar(cambios: Partial<Filtros>): void {
    this.filtros.update((actual) => ({ ...actual, ...cambios }));
  }

  protected escribir(texto: string): void {
    if (this.destino()) this.destino.set(null);
    this.actualizar({ busqueda: texto });
  }

  protected elegirDestino(sugerencia: Sugerencia): void {
    this.destino.set(sugerencia.dato as DireccionGeoref);
    // La direccion es el punto de partida, no un filtro: se muestran todos.
    this.actualizar({ busqueda: '' });
  }
}
