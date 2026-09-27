import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Boton, Cargando, EstadoVacio, Etiqueta, Tarjeta } from '@app/components/ui';
import { direccionCorta, Estacionamiento } from '@app/models';
import { resumenTarifas } from '@app/utils/tarifa.util';
import { AuthService } from '@app/services/auth.service';
import { EstacionamientoService } from '@app/services/estacionamiento.service';

/**
 * Pantalla `/propietario/estacionamientos` · rol PROPIETARIO
 *
 * Los estacionamientos propios. Desde aca se entra a cargar cocheras o a dar
 * de alta uno nuevo.
 */
@Component({
  selector: 'app-estacionamientos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Boton, Cargando, EstadoVacio, Etiqueta, Tarjeta],
  templateUrl: './estacionamientos.html',
})
export class Estacionamientos {
  protected readonly resumenTarifas = resumenTarifas;
  private readonly estacionamientos = inject(EstacionamientoService);
  private readonly auth = inject(AuthService);

  protected readonly direccionCorta = direccionCorta;

  protected readonly recurso = rxResource({
    params: () => this.auth.usuario()?.id,
    stream: () => this.estacionamientos.listarDelPropietario(),
    defaultValue: [] as Estacionamiento[],
  });
}
