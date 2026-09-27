import { ChangeDetectionStrategy, Component, computed, model, signal } from '@angular/core';
import {
  ETIQUETA_TIPO_VEHICULO,
  FiltrosEstacionamiento as Filtros,
  TipoVehiculo,
} from '@app/models';
import { Boton, CampoBusqueda, Chip, Modal } from '@app/components/ui';

/** Orden de los chips segun el diseno. */
const TIPOS: TipoVehiculo[] = ['AUTO', 'MOTO', 'CAMIONETA'];

/** Rangos rapidos del panel de precio, al estilo "Precio" de los marketplaces. */
const RANGOS_PRECIO: { etiqueta: string; minimo: number | null; maximo: number | null }[] = [
  { etiqueta: 'Hasta $1.000', minimo: null, maximo: 1000 },
  { etiqueta: '$1.000 - $2.000', minimo: 1000, maximo: 2000 },
  { etiqueta: '$2.000 - $4.000', minimo: 2000, maximo: 4000 },
  { etiqueta: 'Más de $4.000', minimo: 4000, maximo: null },
];

/**
 * Buscador, tipo de vehiculo y filtro de precio (min/max con rangos rapidos,
 * en un panel aparte como el de un marketplace).
 * El tipo es de seleccion unica obligatoria (siempre hay uno activo).
 */
@Component({
  selector: 'app-filtros-estacionamiento',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CampoBusqueda, Chip, Boton, Modal],
  templateUrl: './filtros-estacionamiento.html',
  host: { class: 'block' },
})
export class FiltrosEstacionamiento {
  readonly filtros = model.required<Filtros>();

  protected readonly tipos = TIPOS;
  protected readonly etiquetaTipo = ETIQUETA_TIPO_VEHICULO;
  protected readonly rangos = RANGOS_PRECIO;

  protected readonly panelAbierto = signal(false);

  /** Borrador del panel: se aplica recien al confirmar, no en cada tecla. */
  protected readonly borradorMinimo = signal<number | null>(null);
  protected readonly borradorMaximo = signal<number | null>(null);

  protected readonly hayPrecioAplicado = computed(
    () => this.filtros().precioMinimo != null || this.filtros().precioMaximo != null,
  );

  protected abrirPanel(): void {
    this.borradorMinimo.set(this.filtros().precioMinimo ?? null);
    this.borradorMaximo.set(this.filtros().precioMaximo ?? null);
    this.panelAbierto.set(true);
  }

  protected cerrarPanel(): void {
    this.panelAbierto.set(false);
  }

  protected usarRango(rango: (typeof RANGOS_PRECIO)[number]): void {
    this.borradorMinimo.set(rango.minimo);
    this.borradorMaximo.set(rango.maximo);
  }

  protected rangoActivo(rango: (typeof RANGOS_PRECIO)[number]): boolean {
    return this.borradorMinimo() === rango.minimo && this.borradorMaximo() === rango.maximo;
  }

  protected aplicarPrecio(): void {
    this.actualizar({ precioMinimo: this.borradorMinimo(), precioMaximo: this.borradorMaximo() });
    this.panelAbierto.set(false);
  }

  protected limpiarPrecio(): void {
    this.borradorMinimo.set(null);
    this.borradorMaximo.set(null);
    this.actualizar({ precioMinimo: null, precioMaximo: null });
    this.panelAbierto.set(false);
  }

  /** Un campo vacio o negativo saca ese limite. */
  protected numero(texto: string): number | null {
    const valor = Number(texto);
    return texto.trim() !== '' && Number.isFinite(valor) && valor >= 0 ? valor : null;
  }

  protected actualizar(cambios: Partial<Filtros>): void {
    this.filtros.update((actual) => ({ ...actual, ...cambios }));
  }
}
