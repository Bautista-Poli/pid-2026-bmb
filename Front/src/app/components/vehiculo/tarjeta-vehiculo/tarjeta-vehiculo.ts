import { NgOptimizedImage } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Boton, Etiqueta, Icono, NombreIcono } from '@app/components/ui';
import { ETIQUETA_TIPO_VEHICULO, TipoVehiculo, Vehiculo } from '@app/models';
import { fotoDeVehiculo } from '@app/utils/foto-vehiculo.util';
import { ChapaPatente } from '../chapa-patente/chapa-patente';

const ICONO_TIPO: Record<TipoVehiculo, NombreIcono> = {
  AUTO: 'auto',
  CAMIONETA: 'camioneta',
  MOTO: 'moto',
};

/**
 * Tarjeta de un vehiculo en "Mis vehiculos": foto grande, chapa de patente y
 * las acciones rapidas. Es presentacional: avisa con `predeterminar` y
 * `eliminar`, y la pantalla hace el pedido y le marca el estado de carga.
 */
@Component({
  selector: 'app-tarjeta-vehiculo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgOptimizedImage, RouterLink, Boton, Etiqueta, Icono, ChapaPatente],
  templateUrl: './tarjeta-vehiculo.html',
  host: { class: 'block' },
})
export class TarjetaVehiculo {
  readonly vehiculo = input.required<Vehiculo>();
  /** Viaja el PATCH que lo marca como predeterminado. */
  readonly predeterminando = input(false);
  /** Hay otra accion en curso (en esta u otra tarjeta): los botones esperan. */
  readonly ocupada = input(false);

  readonly predeterminar = output<Vehiculo>();
  readonly eliminar = output<Vehiculo>();

  protected readonly foto = computed(() => fotoDeVehiculo(this.vehiculo()));
  protected readonly icono = computed(() => ICONO_TIPO[this.vehiculo().tipo]);
  protected readonly tipo = computed(() => ETIQUETA_TIPO_VEHICULO[this.vehiculo().tipo]);

  private readonly marcaYModelo = computed(() => {
    const v = this.vehiculo();
    return [v.marca, v.modelo].filter(Boolean).join(' ');
  });

  /** "Toyota Corolla", o el tipo si el conductor no cargo marca ni modelo. */
  protected readonly nombre = computed(() => this.marcaYModelo() || this.tipo());

  /** "Gris · Auto": lo que no entra en el titulo (sin repetir el tipo si ya es el titulo). */
  protected readonly detalle = computed(() =>
    [this.vehiculo().color, this.marcaYModelo() ? this.tipo() : null].filter(Boolean).join(' · '),
  );
}
