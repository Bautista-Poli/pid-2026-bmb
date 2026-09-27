import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { Boton, CampoBusqueda, Chip, Sugerencia, Tarjeta } from '@app/components/ui';
import { HoraHHmm, Momento, Ubicacion } from '@app/models';
import { DireccionGeoref } from '@app/services/georef.service';
import { aFechaISO } from '@app/utils/fecha.util';

/** Lo que se pregunta antes de listar: donde busca el conductor y para cuando. */
export interface Exploracion {
  ubicacion: Ubicacion;
  momento: Momento;
}

/**
 * Primera pantalla al explorar: ubicacion (actual u otra zona) y momento
 * (ahora, o una franja en "busqueda avanzada"). Emite ambas juntas; los
 * resultados recien se piden despues.
 *
 * En "otra zona", si escribe una direccion con altura ("Pueyrredon 2409") se
 * sugieren direcciones reales: elegir una ordena los resultados por distancia a
 * ese punto. Si escribe un barrio sin elegir sugerencia, filtra por zona.
 */
@Component({
  selector: 'app-elegir-momento',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Boton, CampoBusqueda, Chip, Tarjeta],
  templateUrl: './elegir-momento.html',
  host: { class: 'block' },
})
export class ElegirMomento {
  readonly elegido = output<Exploracion>();
  /** Sugerencias de direcciones para "otra zona". Sin esto, la zona es solo texto. */
  readonly buscarDirecciones = input<((texto: string) => Observable<Sugerencia[]>) | null>(null);

  protected readonly tipoUbicacion = signal<'ACTUAL' | 'OTRA'>('ACTUAL');
  protected readonly zona = signal('');
  /** Direccion elegida de las sugerencias. Se pierde si vuelve a escribir. */
  protected readonly direccionElegida = signal<DireccionGeoref | null>(null);
  protected readonly buscandoUbicacion = signal(false);
  protected readonly errorUbicacion = signal<string | null>(null);
  /** Se marca al intentar avanzar (con "Ahora" o con la franja), para no mostrar el error de zona de entrada. */
  protected readonly intentadoUbicacion = signal(false);

  /** La franja queda oculta detras de "Busqueda avanzada" hasta que se abre. */
  protected readonly avanzadaAbierta = signal(false);
  protected readonly hoy = aFechaISO(new Date());
  protected readonly fecha = signal(this.hoy);
  protected readonly horaDesde = signal<HoraHHmm>('');
  protected readonly horaHasta = signal<HoraHHmm>('');
  protected readonly intentadoFranja = signal(false);

  protected readonly errorFranja = computed(() => {
    if (!this.fecha() || this.fecha() < this.hoy) return 'Elegí una fecha desde hoy.';
    if (!this.horaDesde() || !this.horaHasta()) return 'Completá la hora de inicio y de fin.';
    if (this.horaHasta() <= this.horaDesde()) return 'La hora de fin tiene que ser posterior a la de inicio.';
    return null;
  });

  protected readonly errorUbicacionElegida = computed(() =>
    this.tipoUbicacion() === 'OTRA' && !this.zona().trim() ? 'Contanos la zona donde querés buscar.' : null,
  );

  protected escribirZona(texto: string): void {
    this.zona.set(texto);
    this.direccionElegida.set(null);
  }

  protected elegirDireccion(sugerencia: Sugerencia): void {
    const direccion = sugerencia.dato as DireccionGeoref;
    this.direccionElegida.set(direccion);
    this.zona.set(direccion.nombre);
  }

  protected alternarAvanzada(): void {
    this.avanzadaAbierta.update((abierta) => !abierta);
  }

  protected ahora(): void {
    this.resolverUbicacion((ubicacion) => this.elegido.emit({ ubicacion, momento: { tipo: 'AHORA' } }));
  }

  protected buscarFranja(): void {
    this.intentadoFranja.set(true);
    if (this.errorFranja()) return;

    this.resolverUbicacion((ubicacion) =>
      this.elegido.emit({
        ubicacion,
        momento: {
          tipo: 'FRANJA',
          fecha: this.fecha(),
          horaDesde: this.horaDesde(),
          horaHasta: this.horaHasta(),
        },
      }),
    );
  }

  /**
   * Con "otra zona" resuelve al toque: si eligio una direccion sugerida la usa
   * como punto de partida, si no filtra por la zona escrita. Con la actual,
   * primero pide permiso de geolocalizacion.
   */
  private resolverUbicacion(continuar: (ubicacion: Ubicacion) => void): void {
    this.intentadoUbicacion.set(true);
    if (this.errorUbicacionElegida()) return;

    if (this.tipoUbicacion() === 'OTRA') {
      const direccion = this.direccionElegida();
      continuar(
        direccion
          ? {
              tipo: 'DIRECCION',
              direccion: direccion.nombre,
              latitud: direccion.coordenadas.latitud,
              longitud: direccion.coordenadas.longitud,
            }
          : { tipo: 'OTRA', zona: this.zona().trim() },
      );
      return;
    }

    this.errorUbicacion.set(null);
    if (!('geolocation' in navigator)) {
      this.errorUbicacion.set('Este navegador no puede compartir tu ubicación. Probá con "Otra zona".');
      return;
    }

    this.buscandoUbicacion.set(true);
    navigator.geolocation.getCurrentPosition(
      (posicion) => {
        this.buscandoUbicacion.set(false);
        continuar({
          tipo: 'ACTUAL',
          latitud: posicion.coords.latitude,
          longitud: posicion.coords.longitude,
        });
      },
      () => {
        this.buscandoUbicacion.set(false);
        this.errorUbicacion.set(
          'No pudimos acceder a tu ubicación. Revisá el permiso del navegador o probá con "Otra zona".',
        );
      },
      { timeout: 10_000 },
    );
  }
}
