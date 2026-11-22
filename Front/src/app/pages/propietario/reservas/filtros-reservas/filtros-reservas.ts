import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { Icono } from '@app/components/ui';
import { Estacionamiento, Id, ReservaDetallada } from '@app/models';

/** Lo que el propietario eligio para filtrar sus reservas. */
export interface FiltroReservas {
  /** Texto libre: patente, vehiculo, estacionamiento o cochera. */
  busqueda: string;
  /** Dia (`YYYY-MM-DD`); vacio = todos. */
  fecha: string;
  /** Vacio = todos los estacionamientos. */
  estacionamientoId: Id | '';
  /** Las canceladas quedan ocultas hasta que el propietario las pide. */
  verCanceladas: boolean;
}

/** Sin filtrar nada y con las canceladas ocultas. */
export const SIN_FILTRO: FiltroReservas = { busqueda: '', fecha: '', estacionamientoId: '', verCanceladas: false };

const sinAcentos = (texto: string) =>
  texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Las reservas que pasan el filtro, de la mas reciente a la mas vieja (y por hora dentro del dia). */
export function filtrarReservas(reservas: ReservaDetallada[], filtro: FiltroReservas): ReservaDetallada[] {
  const texto = sinAcentos(filtro.busqueda.trim());

  return reservas
    .filter((r) => filtro.verCanceladas || r.estado !== 'CANCELADA')
    .filter((r) => !filtro.fecha || r.fecha === filtro.fecha)
    .filter((r) => !filtro.estacionamientoId || r.estacionamientoId === filtro.estacionamientoId)
    .filter((r) => {
      if (!texto) return true;
      const campos = [
        r.vehiculo.patente,
        r.vehiculo.marca ?? '',
        r.vehiculo.modelo ?? '',
        r.estacionamiento.nombre,
        r.cochera?.identificador ?? '',
      ];
      return campos.some((campo) => sinAcentos(campo).includes(texto));
    })
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || a.horaDesde.localeCompare(b.horaDesde));
}

/**
 * Filtros de Reservas (reservas.ts): busqueda por patente / vehiculo /
 * estacionamiento, estacionamiento, fecha y si se ven las canceladas.
 *
 * A quien lo usa le deja un solo valor, el filtro elegido, que se aplica con
 * `filtrarReservas`:
 *
 *   <app-filtros-reservas [estacionamientos]="lista" [(filtro)]="filtro" />
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

  readonly filtro = model<FiltroReservas>(SIN_FILTRO);

  protected readonly hayFiltros = computed(() => {
    const { busqueda, fecha, estacionamientoId } = this.filtro();
    return Boolean(busqueda.trim() || fecha || estacionamientoId);
  });

  protected leer(evento: Event): string {
    return (evento.target as HTMLInputElement | HTMLSelectElement).value;
  }

  protected cambiar(cambios: Partial<FiltroReservas>): void {
    this.filtro.update((actual) => ({ ...actual, ...cambios }));
  }

  /** Saca la busqueda, el estacionamiento y la fecha; "ver canceladas" queda como esta. */
  protected limpiarFiltros(): void {
    this.filtro.update((actual) => ({ ...SIN_FILTRO, verCanceladas: actual.verCanceladas }));
  }
}
