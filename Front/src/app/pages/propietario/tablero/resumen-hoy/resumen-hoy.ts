import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Estacionamiento, ReservaDetallada } from '@app/models';
import { hoyISO } from '@app/utils/fecha.util';
import { contarCocheras, reservasDelDia } from '../calculos';
import { Metrica, TarjetaMetrica, Variacion } from '../tarjeta-metrica/tarjeta-metrica';

const UN_DIA_MS = 86_400_000;

const pesos = (monto: number) => `$ ${monto.toLocaleString('es-AR')}`;

/** Diferencia de hoy contra ayer en cantidad ("3 vs. ayer"). */
function diferencia(hoy: number, ayer: number): Variacion {
  const delta = hoy - ayer;
  if (delta === 0) return { sube: null, texto: 'igual que ayer' };
  return { sube: delta > 0, texto: `${Math.abs(delta)} vs. ayer` };
}

/** Variacion de hoy contra ayer en porcentaje ("12% vs. ayer"). */
function porcentaje(hoy: number, ayer: number): Variacion {
  if (ayer === 0) {
    return hoy === 0 ? { sube: null, texto: 'igual que ayer' } : { sube: true, texto: 'sin ingresos ayer' };
  }
  const delta = Math.round(((hoy - ayer) / ayer) * 100);
  if (delta === 0) return { sube: null, texto: 'igual que ayer' };
  return { sube: delta > 0, texto: `${Math.abs(delta)}% vs. ayer` };
}

/**
 * Las metricas de arriba del tablero (tablero.ts): cocheras disponibles,
 * reservas e ingresos de hoy (comparados con ayer) y estacionamientos.
 *
 * Se arregla solo: recibe los estacionamientos y las reservas tal como llegan
 * y calcula cada numero.
 *
 *   <app-resumen-hoy [estacionamientos]="lista" [reservas]="reservas" [cargando]="..." />
 */
@Component({
  selector: 'app-resumen-hoy',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TarjetaMetrica],
  templateUrl: './resumen-hoy.html',
  styleUrl: './resumen-hoy.css',
})
export class ResumenHoy {
  readonly estacionamientos = input.required<Estacionamiento[]>();
  readonly reservas = input.required<ReservaDetallada[]>();
  /** Mientras llegan las reservas, sus metricas muestran un guion. */
  readonly cargando = input(false);

  private readonly hoyISO = hoyISO();
  private readonly ayerISO = hoyISO(new Date(Date.now() - UN_DIA_MS));

  protected readonly metricas = computed<Metrica[]>(() => {
    const cargando = this.cargando();
    const lotes = this.estacionamientos();
    const { total, libres } = contarCocheras(lotes);

    const hoy = reservasDelDia(this.reservas(), this.hoyISO);
    const ayer = reservasDelDia(this.reservas(), this.ayerISO);
    const ingresosHoy = hoy.reduce((t, r) => t + r.precioTotal, 0);
    const ingresosAyer = ayer.reduce((t, r) => t + r.precioTotal, 0);

    return [
      {
        etiqueta: 'Cocheras disponibles',
        valor: String(libres),
        complemento: `/ ${total}`,
        icono: 'auto',
        tono: 'azul',
        detalle: `${total - libres} ocupadas ahora`,
      },
      {
        etiqueta: 'Reservas de hoy',
        valor: cargando ? '—' : String(hoy.length),
        icono: 'calendario',
        tono: 'azul',
        variacion: cargando ? undefined : diferencia(hoy.length, ayer.length),
      },
      {
        etiqueta: 'Ingresos de hoy',
        valor: cargando ? '—' : pesos(ingresosHoy),
        icono: 'moneda',
        tono: 'verde',
        variacion: cargando ? undefined : porcentaje(ingresosHoy, ingresosAyer),
      },
      {
        etiqueta: 'Estacionamientos',
        valor: String(lotes.length),
        icono: 'edificio',
        tono: 'violeta',
        detalle: `${lotes.filter((e) => e.activo && e.publicado).length} publicados`,
      },
    ];
  });
}
