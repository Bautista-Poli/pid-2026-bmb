import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { BarraDia, BarrasDia, MapaCalor, TarjetaMetrica, TonoMetrica } from '@app/components/estadistica';
import { Boton, Cargando, Chip, EstadoVacio, NombreIcono, Tarjeta } from '@app/components/ui';
import {
  Estacionamiento,
  EstadisticasPropietario,
  ETIQUETA_ORIGEN_CANCELACION,
  OrigenCancelacionEstadistica,
} from '@app/models';
import { AuthService } from '@app/services/auth.service';
import { EstacionamientoService } from '@app/services/estacionamiento.service';
import { EstadisticaService } from '@app/services/estadistica.service';
import { PERIODOS, rangoDePeriodo, TipoPeriodo, Variacion, variacion } from '@app/utils/periodo.util';

const pesos = (monto: number) => `$ ${Math.round(monto).toLocaleString('es-AR')}`;
const porciento = (fraccion: number) => `${Math.round(fraccion * 100)} %`;
const DIAS_PLURAL = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'];

/** "12/10" para el tooltip; debajo de la barra alcanza con el dia ("12"). */
const diaYMes = (fecha: string) => `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`;
const diaDelMes = (fecha: string) => String(Number(fecha.slice(8, 10)));

interface Metrica {
  etiqueta: string;
  valor: string;
  icono: NombreIcono;
  tono: TonoMetrica;
  variacion: Variacion;
}

const ORIGENES: OrigenCancelacionEstadistica[] = ['CONDUCTOR', 'PROPIETARIO', 'SISTEMA', 'SIN_DATO'];

/**
 * Pantalla `/propietario/estadisticas` · rol PROPIETARIO
 *
 * Como le fue al estacionamiento en un periodo: ocupacion, ingresos simulados,
 * demanda por horario, cancelaciones y ausentes, contra el periodo anterior.
 * El periodo y el estacionamiento viven en la URL (`?periodo=&estacionamiento=`).
 */
@Component({
  selector: 'app-estadisticas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BarrasDia, Boton, Cargando, Chip, EstadoVacio, MapaCalor, RouterLink, Tarjeta, TarjetaMetrica],
  templateUrl: './estadisticas.html',
})
export class Estadisticas {
  private readonly estadisticas = inject(EstadisticaService);
  private readonly estacionamientos = inject(EstacionamientoService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

  protected readonly periodos = PERIODOS;
  protected readonly origenes = ORIGENES;
  protected readonly etiquetaOrigen = ETIQUETA_ORIGEN_CANCELACION;
  protected readonly pesos = pesos;

  private readonly params = toSignal(this.ruta.queryParamMap, { requireSync: true });

  protected readonly periodo = computed<TipoPeriodo>(() => {
    const elegido = this.params().get('periodo') as TipoPeriodo | null;
    return PERIODOS.some((p) => p.tipo === elegido) ? elegido! : '30D';
  });
  protected readonly estacionamientoId = computed(() => this.params().get('estacionamiento') ?? '');

  protected readonly recursoEstacionamientos = rxResource({
    params: () => this.auth.usuario()?.id,
    stream: () => this.estacionamientos.listarDelPropietario().pipe(map((lista) => lista.filter((e) => e.activo))),
    defaultValue: [] as Estacionamiento[],
  });

  protected readonly recurso = rxResource({
    params: () => ({ ...rangoDePeriodo(this.periodo()), estacionamientoId: this.estacionamientoId() || null }),
    stream: ({ params }) => this.estadisticas.delPropietario(params),
  });

  protected readonly metricas = computed<Metrica[]>(() => {
    const datos = this.recurso.value();
    if (!datos) return [];
    const { ocupacion, ingresos, reservas, tasaCancelacion, ausentes, devoluciones } = datos.kpis;
    return [
      { etiqueta: 'Ocupación', valor: porciento(ocupacion.valor), icono: 'estacionamiento', tono: 'azul', variacion: variacion(ocupacion.valor, ocupacion.anterior, { puntos: true }) },
      { etiqueta: 'Ingresos', valor: pesos(ingresos.valor), icono: 'moneda', tono: 'verde', variacion: variacion(ingresos.valor, ingresos.anterior) },
      { etiqueta: 'Reservas', valor: String(reservas.valor), icono: 'reservas', tono: 'violeta', variacion: variacion(reservas.valor, reservas.anterior) },
      { etiqueta: 'Cancelaciones', valor: porciento(tasaCancelacion.valor), icono: 'cerrar', tono: 'ambar', variacion: variacion(tasaCancelacion.valor, tasaCancelacion.anterior, { menosEsMejor: true, puntos: true }) },
      { etiqueta: 'Ausentes', valor: String(ausentes.valor), icono: 'alerta', tono: 'rojo', variacion: variacion(ausentes.valor, ausentes.anterior, { menosEsMejor: true }) },
      // Lo devuelto por reclamos: ya esta descontado de Ingresos.
      { etiqueta: 'Devoluciones', valor: pesos(devoluciones.valor), icono: 'moneda', tono: 'rojo', variacion: variacion(devoluciones.valor, devoluciones.anterior, { menosEsMejor: true }) },
    ];
  });

  protected readonly barrasOcupacion = computed<BarraDia[]>(() =>
    (this.recurso.value()?.ocupacionPorDia ?? []).map((d) => ({
      clave: d.fecha,
      etiqueta: diaDelMes(d.fecha),
      tramos: [
        { valor: d.horasUsadas, clase: 'bg-acento', etiqueta: 'usadas' },
        { valor: Math.max(0, d.horasOfrecidas - d.horasUsadas), clase: 'bg-acento/20', etiqueta: 'libres' },
      ],
      detalle: `${diaYMes(d.fecha)} · ${d.horasUsadas} h usadas de ${d.horasOfrecidas} h`,
    })),
  );

  protected readonly barrasIngresos = computed<BarraDia[]>(() =>
    (this.recurso.value()?.ingresosPorDia ?? []).map((d) => ({
      clave: d.fecha,
      etiqueta: diaDelMes(d.fecha),
      tramos: [
        { valor: d.reservas, clase: 'bg-exito', etiqueta: 'reservas' },
        { valor: d.abonos, clase: 'bg-violet-500', etiqueta: 'abonos' },
      ],
      detalle:
        `${diaYMes(d.fecha)} · Reservas ${pesos(d.reservas)} · Abonos ${pesos(d.abonos)}` +
        (d.devoluciones > 0 ? ` · − ${pesos(d.devoluciones)} devuelto` : ''),
    })),
  );

  protected readonly hayIngresos = computed(() => this.barrasIngresos().some((b) => b.tramos.some((t) => t.valor > 0)));
  protected readonly hayOcupacion = computed(() =>
    (this.recurso.value()?.ocupacionPorDia ?? []).some((d) => d.horasOfrecidas > 0),
  );

  protected readonly horaPico = computed(() => {
    const pico = this.recurso.value()?.horaPico;
    return pico ? `Los ${DIAS_PLURAL[pico.diaSemana]} a las ${pico.hora}:00` : null;
  });

  /** Barras horizontales de cancelaciones: ancho relativo a la mas grande. */
  protected anchoOrigen(datos: EstadisticasPropietario, origen: OrigenCancelacionEstadistica): number {
    const mayor = Math.max(1, ...ORIGENES.map((o) => datos.cancelaciones.porOrigen[o]));
    return (datos.cancelaciones.porOrigen[origen] / mayor) * 100;
  }

  protected porciento(fraccion: number): string {
    return porciento(fraccion);
  }

  protected elegirPeriodo(periodo: TipoPeriodo): void {
    void this.router.navigate([], { queryParams: { periodo }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  protected elegirEstacionamiento(evento: Event): void {
    const estacionamiento = (evento.target as HTMLSelectElement).value || null;
    void this.router.navigate([], { queryParams: { estacionamiento }, queryParamsHandling: 'merge', replaceUrl: true });
  }
}
