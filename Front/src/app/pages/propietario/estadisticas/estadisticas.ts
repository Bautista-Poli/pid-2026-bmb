import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { CambioPeriodo, SelectorPeriodo, TarjetaMetrica, TonoMetrica } from '@app/components/estadistica';
import { Boton, Cargando, EstadoVacio, NombreIcono } from '@app/components/ui';
import { Estacionamiento } from '@app/models';
import { AuthService } from '@app/services/auth.service';
import { EstacionamientoService } from '@app/services/estacionamiento.service';
import { EstadisticaService } from '@app/services/propietario/estadistica.service';
import { periodoDeUrl, Variacion, variacion } from '@app/utils/periodo.util';
import { CancelacionesAusentes } from './cancelaciones-ausentes/cancelaciones-ausentes';
import { DemandaHorario } from './demanda-horario/demanda-horario';
import { pesos, porciento } from './formato';
import { GraficoIngresos } from './grafico-ingresos/grafico-ingresos';
import { GraficoOcupacion } from './grafico-ocupacion/grafico-ocupacion';

interface Metrica {
  etiqueta: string;
  valor: string;
  icono: NombreIcono;
  tono: TonoMetrica;
  variacion: Variacion;
}

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
  imports: [
    GraficoOcupacion,
    GraficoIngresos,
    DemandaHorario,
    CancelacionesAusentes,
    Boton,
    Cargando,
    EstadoVacio,
    RouterLink,
    SelectorPeriodo,
    TarjetaMetrica,
  ],
  templateUrl: './estadisticas.html',
  styleUrls: ['./compartido.css', './estadisticas.css'],
})
export class Estadisticas {
  private readonly estadisticas = inject(EstadisticaService);
  private readonly estacionamientos = inject(EstacionamientoService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

  private readonly params = toSignal(this.ruta.queryParamMap, { requireSync: true });

  /** Periodo de la URL: `?periodo=7D|MES` o `?desde=&hasta=` (rango personalizado). */
  protected readonly periodo = computed(() =>
    periodoDeUrl({
      periodo: this.params().get('periodo'),
      desde: this.params().get('desde'),
      hasta: this.params().get('hasta'),
    }),
  );
  protected readonly estacionamientoId = computed(() => this.params().get('estacionamiento') ?? '');

  protected readonly recursoEstacionamientos = rxResource({
    params: () => this.auth.usuario()?.id,
    stream: () => this.estacionamientos.listarDelPropietario().pipe(map((lista) => lista.filter((e) => e.activo))),
    defaultValue: [] as Estacionamiento[],
  });

  protected readonly recurso = rxResource({
    params: () => ({
      desde: this.periodo().desde,
      hasta: this.periodo().hasta,
      estacionamientoId: this.estacionamientoId() || null,
    }),
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

  protected elegirPeriodo(cambio: CambioPeriodo): void {
    void this.router.navigate([], { queryParams: cambio, queryParamsHandling: 'merge', replaceUrl: true });
  }

  protected elegirEstacionamiento(evento: Event): void {
    const estacionamiento = (evento.target as HTMLSelectElement).value || null;
    void this.router.navigate([], { queryParams: { estacionamiento }, queryParamsHandling: 'merge', replaceUrl: true });
  }
}
