import { ChangeDetectionStrategy, Component, inject, model } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Icono, NombreIcono } from '@app/components/ui';
import { Estacionamiento } from '@app/models';
import { UbicacionService } from '@app/services/conductor/ubicacion.service';
import { EstacionamientoService } from '@app/services/estacionamiento.service';
import { Destino, TipoLugar } from '@app/utils/direcciones.util';
import { buscarDestinosLocales } from '@app/utils/destinos-locales.util';
import { Observable, of } from 'rxjs';
import { CampoBusqueda, Sugerencia } from './campo-busqueda/campo-busqueda';

/** Lo que el conductor busco en Explorar. */
export interface Busqueda {
  /** Lo que se ve escrito en el campo. */
  escrito: string;
  /** Zona, direccion o estacionamiento elegido de las sugerencias: las distancias se miden desde ahi. */
  destino: Destino | null;
  /** Texto buscado con Enter, sin elegir sugerencia: filtra por nombre o zona. Vacio si no se busco asi. */
  nombre: string;
}

/** Sin nada escrito ni elegido: se busca alrededor de la ubicacion del conductor. */
export const SIN_BUSQUEDA: Busqueda = { escrito: '', destino: null, nombre: '' };

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
 * Buscador de destino de Explorar: el campo con sugerencias y el boton "mi
 * ubicacion".
 *
 * Se arregla solo: pide los estacionamientos publicados para armar las
 * sugerencias y le pide la ubicacion al servicio. A quien lo usa solo le deja
 * lo buscado:
 *
 *   <app-buscador-destino [(busqueda)]="busqueda" />
 */
@Component({
  selector: 'app-buscador-destino',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icono, CampoBusqueda],
  templateUrl: './buscador-destino.html',
  styleUrl: './buscador-destino.css',
})
export class BuscadorDestino {
  private readonly estacionamientos = inject(EstacionamientoService);
  private readonly ubicacion = inject(UbicacionService);

  readonly busqueda = model<Busqueda>(SIN_BUSQUEDA);

  /** Todos los estacionamientos publicados: de ahi salen las sugerencias (sus barrios y nombres). */
  private readonly publicados = rxResource({
    stream: () => this.estacionamientos.listar({}),
    defaultValue: [] as Estacionamiento[],
  });

  /**
   * Sugerencias del buscador (desde la 3ra letra): los barrios y los
   * estacionamientos que ya estan en la base (buscarDestinosLocales).
   */
  protected readonly buscarSugerencias = (texto: string): Observable<Sugerencia<Destino>[]> =>
    of(
      buscarDestinosLocales(texto, this.publicados.value())
        .slice(0, MAX_SUGERENCIAS)
        .map((lugar) => ({
          nombre: lugar.nombre,
          detalle: lugar.detalle,
          dato: lugar,
          icono: ICONO_LUGAR[lugar.tipo ?? 'lugar'],
        })),
    );

  /** Escribir descarta el destino elegido; borrar todo tambien saca la busqueda por nombre. */
  protected escribir(escrito: string): void {
    this.busqueda.update((actual) => ({
      escrito,
      destino: null,
      nombre: escrito.trim() ? actual.nombre : '',
    }));
  }

  /** Enter sin elegir una sugerencia: busca por nombre o zona. */
  protected buscarPorNombre(): void {
    this.busqueda.update((actual) => ({
      ...actual,
      nombre: actual.destino ? '' : actual.escrito.trim(),
    }));
  }

  /** Las sugerencias siempre traen su destino en `dato` (ver `buscarSugerencias`). */
  protected elegir(sugerencia: Sugerencia): void {
    const destino = sugerencia.dato as Destino;
    this.busqueda.set({ escrito: destino.nombre, destino, nombre: '' });
  }

  /** Vuelve a buscar alrededor del conductor. */
  protected usarMiUbicacion(): void {
    this.busqueda.set(SIN_BUSQUEDA);
    this.ubicacion.solicitar();
  }
}
