import { ChangeDetectionStrategy, Component, computed, output, signal } from '@angular/core';
import { Boton, Chip, Tarjeta } from '@app/components/ui';
import { HoraHHmm, Momento, Ubicacion } from '@app/models';
import { aFechaISO } from '@app/utils/fecha.util';

/** Lo que se pregunta antes de listar: donde busca el conductor y para cuando. */
export interface Exploracion {
  ubicacion: Ubicacion;
  momento: Momento;
}

/**
 * Primera pantalla al explorar: ubicacion (actual o una zona escrita a mano) y
 * momento (ahora, o una franja en "busqueda avanzada"). Emite ambas juntas;
 * los resultados recien se piden despues.
 */
@Component({
  selector: 'app-elegir-momento',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Boton, Chip, Tarjeta],
  templateUrl: './elegir-momento.html',
  host: { class: 'block' },
})
export class ElegirMomento {
  readonly elegido = output<Exploracion>();

  protected readonly tipoUbicacion = signal<'ACTUAL' | 'OTRA'>('ACTUAL');
  protected readonly zona = signal('');
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

  /** Con "otra zona" resuelve al toque; con la actual, primero pide permiso de geolocalizacion. */
  private resolverUbicacion(continuar: (ubicacion: Ubicacion) => void): void {
    this.intentadoUbicacion.set(true);
    if (this.errorUbicacionElegida()) return;

    if (this.tipoUbicacion() === 'OTRA') {
      continuar({ tipo: 'OTRA', zona: this.zona().trim() });
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
