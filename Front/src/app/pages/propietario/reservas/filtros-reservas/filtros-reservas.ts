import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { Icono } from '@app/components/ui';
import { Estacionamiento, Id } from '@app/models';

/**
 * Filtros de Reservas (reservas.ts): busqueda por patente / vehiculo /
 * estacionamiento, estacionamiento, fecha y si se ven las canceladas. Cada
 * filtro es un `model`: la pantalla los lee y filtra.
 */
@Component({
  selector: 'app-filtros-reservas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icono],
  templateUrl: './filtros-reservas.html',
  styleUrl: './filtros-reservas.css',
  host: { style: 'display: contents' },
})
export class FiltrosReservas {
  /** El selector de estacionamiento aparece solo si hay mas de uno. */
  readonly estacionamientos = input<Estacionamiento[]>([]);

  readonly busqueda = model('');
  readonly fecha = model('');
  readonly estacionamientoId = model<Id | ''>('');
  /** Las canceladas quedan ocultas hasta que el propietario las pide. */
  readonly verCanceladas = model(false);

  protected readonly hayFiltros = computed(
    () => Boolean(this.busqueda().trim() || this.fecha() || this.estacionamientoId()),
  );

  protected leer(evento: Event): string {
    return (evento.target as HTMLInputElement | HTMLSelectElement).value;
  }

  protected limpiarFiltros(): void {
    this.busqueda.set('');
    this.fecha.set('');
    this.estacionamientoId.set('');
  }
}
