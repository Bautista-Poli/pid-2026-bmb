import { ChangeDetectionStrategy, Component, computed, linkedSignal, model, signal } from '@angular/core';
import { Chip, Icono, Modal, NombreIcono } from '@app/components/ui';
import { OrdenEstacionamiento } from '@app/models';
import { hoyISO } from '@app/utils/fecha.util';
import { HORAS_MAXIMAS, OPCIONES_NIVEL, ORDENES, PANEL_INICIAL, PRECIO_PASO, PRECIO_TOPE } from '../constantes';
import { Panel, horaFin, pesos } from '../panel.interface';

/**
 * Boton "Filtrar" de la pantalla Explorar, con su modal.
 *
 * Se arregla solo: abre y cierra el modal, cuenta cuantos filtros hay en uso y
 * trabaja sobre un borrador, que recien pasa a ser `filtros` al tocar "Aplicar"
 * (si el horario es valido). "Limpiar" vuelve a los filtros de fabrica sin
 * tocar el orden. A quien lo usa solo le deja los filtros en uso:
 *
 *   <app-filtros [(filtros)]="filtros" />
 */
@Component({
  selector: 'app-filtros',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Chip, Icono, Modal],
  templateUrl: './filtros.html',
  styleUrl: './filtros.css',
})
export class Filtros {
  /** Los filtros en uso. */
  readonly filtros = model.required<Panel>();

  protected readonly abierto = signal(false);

  /** Cuantos filtros estan en uso (el orden no cuenta: tiene su propio selector en la lista). */
  protected readonly activos = computed(() => {
    const { desde, precioMinimo, precioMaximo, soloCubiertos, nivelMinimo } = this.filtros();
    return [desde, precioMinimo > 0 || precioMaximo < PRECIO_TOPE, soloCubiertos, nivelMinimo].filter(
      Boolean,
    ).length;
  });

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
  protected readonly panel = linkedSignal(() => this.filtros());
  /** Si ya se toco "Aplicar" (recien ahi se muestra el error del horario). */
  protected readonly intentoBuscar = signal(false);

  /** El modal arranca con lo que esta en uso: si se cierra sin aplicar, no cambia nada. */
  protected abrir(): void {
    this.panel.set(this.filtros());
    this.intentoBuscar.set(false);
    this.abierto.set(true);
  }

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

  /** Valida el horario y, si esta bien, pone en uso los filtros nuevos. */
  protected aplicarFiltros(): void {
    this.intentoBuscar.set(true);
    if (this.errorHorario()) return;
    this.filtros.set(this.panel());
    this.abierto.set(false);
  }

  /** Vuelve a los filtros iniciales (sin tocar el orden). */
  protected limpiarFiltros(): void {
    this.filtros.set({ ...PANEL_INICIAL, orden: this.filtros().orden });
    this.abierto.set(false);
  }
}
