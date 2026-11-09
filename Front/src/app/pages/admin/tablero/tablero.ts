import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { CambioPeriodo, SelectorPeriodo, TarjetaMetrica, TonoMetrica } from '@app/components/estadistica';
import { Boton, Cargando, EstadoVacio, NombreIcono } from '@app/components/ui';
import { EstadisticasAdmin } from '@app/models';
import { AdminService } from '@app/services/admin/admin.service';
import { periodoDeUrl, Variacion, variacion } from '@app/utils/periodo.util';
import { CocherasBloqueadas } from './cocheras-bloqueadas/cocheras-bloqueadas';
import { DisputasPendientes } from './disputas-pendientes/disputas-pendientes';
import { EstacionamientosProblematicos } from './estacionamientos-problematicos/estacionamientos-problematicos';
import { pesos, porciento } from './formato';
import { PendientesAprobacion } from './pendientes-aprobacion/pendientes-aprobacion';
import { RankingEstacionamientos } from './ranking-estacionamientos/ranking-estacionamientos';
import { ReservasPorDia } from './reservas-por-dia/reservas-por-dia';

interface Metrica {
  etiqueta: string;
  valor: string;
  icono: NombreIcono;
  tono: TonoMetrica;
  variacion: Variacion;
}

/**
 * Pantalla `/admin/tablero` · rol ADMINISTRADOR
 *
 * El inicio del administrador: lo que espera una decision (estacionamientos por
 * aprobar y disputas), los conflictos del periodo (bloqueos de cocheras y
 * estacionamientos problematicos) y la actividad de toda la plataforma contra
 * el periodo anterior. El periodo vive en la URL (`?periodo=`).
 */
@Component({
  selector: 'app-tablero-admin',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PendientesAprobacion,
    DisputasPendientes,
    CocherasBloqueadas,
    EstacionamientosProblematicos,
    ReservasPorDia,
    RankingEstacionamientos,
    Boton,
    Cargando,
    EstadoVacio,
    SelectorPeriodo,
    TarjetaMetrica,
  ],
  templateUrl: './tablero.html',
  styleUrls: ['./compartido.css', './tablero.css'],
})
export class Tablero {
  private readonly admin = inject(AdminService);
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

  protected readonly recurso = rxResource({
    params: () => ({ desde: this.periodo().desde, hasta: this.periodo().hasta }),
    stream: ({ params }) => this.admin.estadisticas(params.desde, params.hasta),
  });

  /**
   * Lo que se muestra: el ultimo resultado. Al cambiar de periodo el recurso
   * vuelve a vacio mientras carga; asi la pagina no colapsa al esqueleto (y el
   * chip con el foco no se destruye): se atenua hasta que llega lo nuevo.
   */
  protected readonly datos = linkedSignal<EstadisticasAdmin | undefined, EstadisticasAdmin | undefined>({
    source: () => this.recurso.value(),
    computation: (nuevo, previo) => nuevo ?? previo?.value,
  });

  protected readonly metricas = computed<Metrica[]>(() => {
    const datos = this.datos();
    if (!datos) return [];
    const k = datos.actividad.kpis;
    return [
      { etiqueta: 'Conductores nuevos', valor: String(k.conductoresNuevos.valor), icono: 'auto', tono: 'azul', variacion: variacion(k.conductoresNuevos.valor, k.conductoresNuevos.anterior) },
      { etiqueta: 'Propietarios nuevos', valor: String(k.propietariosNuevos.valor), icono: 'edificio', tono: 'violeta', variacion: variacion(k.propietariosNuevos.valor, k.propietariosNuevos.anterior) },
      { etiqueta: 'Estacionamientos aprobados', valor: String(k.estacionamientosAprobados.valor), icono: 'estacionamiento', tono: 'verde', variacion: variacion(k.estacionamientosAprobados.valor, k.estacionamientosAprobados.anterior) },
      { etiqueta: 'Reservas', valor: String(k.reservas.valor), icono: 'reservas', tono: 'azul', variacion: variacion(k.reservas.valor, k.reservas.anterior) },
      { etiqueta: 'Volumen', valor: pesos(k.volumen.valor), icono: 'moneda', tono: 'verde', variacion: variacion(k.volumen.valor, k.volumen.anterior) },
      { etiqueta: 'Devoluciones', valor: pesos(k.devoluciones.valor), icono: 'moneda', tono: 'rojo', variacion: variacion(k.devoluciones.valor, k.devoluciones.anterior, { menosEsMejor: true }) },
      { etiqueta: 'Cancelaciones', valor: porciento(k.tasaCancelacion.valor), icono: 'cerrar', tono: 'ambar', variacion: variacion(k.tasaCancelacion.valor, k.tasaCancelacion.anterior, { menosEsMejor: true, puntos: true }) },
    ];
  });

  protected elegirPeriodo(cambio: CambioPeriodo): void {
    void this.router.navigate([], { queryParams: cambio, queryParamsHandling: 'merge', replaceUrl: true });
  }
}
