import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, output } from '@angular/core';
import { Chip, Icono, Modal, NombreIcono } from '@app/components/ui';
import { OrdenEstacionamiento } from '@app/models';
import { hoyISO } from '@app/utils/fecha.util';
import { HORAS_MAXIMAS, OPCIONES_NIVEL, ORDENES, PRECIO_PASO, PRECIO_TOPE } from '../constantes';
import { Panel, horaFin, pesos } from '../panel.interface';

/**
 * Modal "Filtrar" de la pantalla Explorar (mapa.ts).
 *
 * Trabaja sobre un borrador: arranca con `inicial` (lo que esta en uso) y los
 * cambios no se aplican hasta tocar "Aplicar", que valida el horario y emite
 * `aplicar` con los filtros nuevos. "Limpiar" emite `limpiar` y la pantalla
 * vuelve a los filtros iniciales.
 */
@Component({
  selector: 'app-modal-filtros',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Chip, Icono, Modal],
  templateUrl: './modal-filtros.html',
  styleUrl: './modal-filtros.css',
})
export class ModalFiltros {
  readonly abierto = input(false);
  /** Filtros con los que se abre el modal. Cada vez que cambia, se descarta el borrador. */
  readonly inicial = input.required<Panel>();

  readonly cerrado = output<void>();
  readonly aplicar = output<Panel>();
  readonly limpiar = output<void>();

  protected readonly opcionesNivel = OPCIONES_NIVEL;
  protected readonly ordenes = ORDENES;
  protected readonly iconoOrden: Record<OrdenEstacionamiento, NombreIcono> = {
    DISTANCIA: 'explorar',
    PRECIO: 'moneda',
    REPUTACION: 'estrella',
  };
  protected readonly precioTope = PRECIO_TOPE;
  protected readonly precioPaso = PRECIO_PASO;
  protected readonly horasMaximas = HORAS_MAXIMAS;
  protected readonly hoy = hoyISO();

  /** Borrador del modal: lo que se esta editando. */
  protected readonly panel = linkedSignal(() => this.inicial());
  /** Si ya se toco "Aplicar" (recien ahi se muestra el error del horario). */
  protected readonly intentoBuscar = linkedSignal(() => {
    this.inicial();
    return false;
  });

  protected readonly errorHorario = computed(() => {
    const { fecha, desde, horas } = this.panel();
    if (!desde) return null;
    if (!fecha || fecha < this.hoy) return 'Elegí una fecha desde hoy.';
    if (!horaFin(desde, horas)) return 'La reserva tiene que terminar antes de la medianoche. Probá con menos horas.';
    return null;
  });

  protected readonly textoPrecio = computed(() => {
    const { precioMinimo, precioMaximo } = this.panel();
    const maximo = precioMaximo >= PRECIO_TOPE ? `${pesos(PRECIO_TOPE)}+` : pesos(precioMaximo);
    return `${pesos(precioMinimo)} - ${maximo}`;
  });

  /** "Hasta las 14:30", para que se vea cuando termina la reserva. */
  protected readonly textoFin = computed(() => {
    const { desde, horas } = this.panel();
    const fin = desde ? horaFin(desde, horas) : null;
    return fin ? `Hasta las ${fin}` : null;
  });

  protected cambiar(cambios: Partial<Panel>): void {
    this.panel.update((actual) => ({ ...actual, ...cambios }));
  }

  /** Horas a reservar: entre 1 y `HORAS_MAXIMAS`. */
  protected cambiarHoras(delta: number): void {
    const horas = Math.min(Math.max(this.panel().horas + delta, 1), HORAS_MAXIMAS);
    this.cambiar({ horas });
  }

  /** Los dos extremos del rango no se cruzan: el que se mueve empuja hasta el otro. */
  protected moverMinimo(valor: string): void {
    this.cambiar({ precioMinimo: Math.min(Number(valor), this.panel().precioMaximo - PRECIO_PASO) });
  }

  protected moverMaximo(valor: string): void {
    this.cambiar({ precioMaximo: Math.max(Number(valor), this.panel().precioMinimo + PRECIO_PASO) });
  }

  /** Valida el horario y, si esta bien, le pasa a la pantalla los filtros nuevos. */
  protected aplicarFiltros(): void {
    this.intentoBuscar.set(true);
    if (this.errorHorario()) return;
    this.aplicar.emit(this.panel());
  }

  protected limpiarFiltros(): void {
    this.limpiar.emit();
  }
}
