import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { BarraDia, BarrasDia, CambioPeriodo, SelectorPeriodo, TarjetaMetrica, TonoMetrica } from '@app/components/estadistica';
import { Boton, Cargando, EstadoVacio, NombreIcono, Tarjeta } from '@app/components/ui';
import {
  ETIQUETA_MOTIVO_RECLAMO,
  ETIQUETA_RAZON_PROBLEMATICO,
  ETIQUETA_TIPO_INCIDENCIA,
  EstadisticasAdmin,
  MotivoReclamo,
  TipoIncidencia,
} from '@app/models';
import { AdminService } from '@app/services/admin.service';
import { periodoDeUrl, Variacion, variacion } from '@app/utils/periodo.util';
import { haceCuanto } from '@app/utils/tiempo.util';

// Espacio no separable: el "$" no queda solo en una linea en las tarjetas angostas.
const NBSP = String.fromCharCode(160);
const pesos = (monto: number) => `$${NBSP}${Math.round(monto).toLocaleString('es-AR')}`;
const porciento = (fraccion: number) => `${Math.round(fraccion * 100)} %`;
const diaYMes = (fecha: string) => `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`;
const diaDelMes = (fecha: string) => String(Number(fecha.slice(8, 10)));

interface Metrica {
  etiqueta: string;
  valor: string;
  icono: NombreIcono;
  tono: TonoMetrica;
  variacion: Variacion;
}

/** Tramos de las barras de reservas por dia, de abajo hacia arriba. */
const TRAMOS_RESERVAS = [
  { clave: 'finalizadas', clase: 'bg-exito', etiqueta: 'Finalizadas' },
  { clave: 'enCurso', clase: 'bg-acento', etiqueta: 'En curso' },
  { clave: 'confirmadas', clase: 'bg-acento/40', etiqueta: 'Confirmadas' },
  { clave: 'pendientes', clase: 'bg-baja', etiqueta: 'Pendientes' },
  { clave: 'canceladas', clase: 'bg-ocupada/70', etiqueta: 'Canceladas' },
  { clave: 'ausentes', clase: 'bg-humo', etiqueta: 'Ausentes' },
] as const;

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
  imports: [BarrasDia, Boton, Cargando, EstadoVacio, RouterLink, SelectorPeriodo, Tarjeta, TarjetaMetrica],
  templateUrl: './tablero.html',
  styleUrl: './tablero.css',
})
export class Tablero {
  private readonly admin = inject(AdminService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

  protected readonly tramosReservas = TRAMOS_RESERVAS;
  protected readonly etiquetaRazon = ETIQUETA_RAZON_PROBLEMATICO;
  protected readonly pesos = pesos;
  protected readonly porciento = porciento;
  protected readonly haceCuanto = haceCuanto;

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

  /** "Reclamo · No había cochera libre" o "Auto excedido". */
  protected tituloDisputa(tipo: string, motivo: string | null): string {
    const nombre = ETIQUETA_TIPO_INCIDENCIA[tipo as TipoIncidencia] ?? tipo;
    return motivo ? `${nombre} · ${ETIQUETA_MOTIVO_RECLAMO[motivo as MotivoReclamo] ?? motivo}` : nombre;
  }

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

  protected readonly barrasReservas = computed<BarraDia[]>(() =>
    (this.datos()?.actividad.reservasPorDia ?? []).map((d) => {
      const partes = TRAMOS_RESERVAS.filter((t) => d[t.clave] > 0).map((t) => `${t.etiqueta} ${d[t.clave]}`);
      return {
        clave: d.fecha,
        etiqueta: diaDelMes(d.fecha),
        tramos: TRAMOS_RESERVAS.map((t) => ({ valor: d[t.clave], clase: t.clase, etiqueta: t.etiqueta })),
        detalle: `${diaYMes(d.fecha)} · ${partes.length > 0 ? partes.join(' · ') : 'Sin reservas'}`,
      };
    }),
  );

  protected readonly hayReservas = computed(() => this.barrasReservas().some((b) => b.tramos.some((t) => t.valor > 0)));

  protected readonly totalBloqueos = computed(() => {
    const b = this.datos()?.conflictos.bloqueos;
    return b ? b.reasignadas + b.canceladas + b.autosExcedidos + b.sinCochera : 0;
  });

  protected elegirPeriodo(cambio: CambioPeriodo): void {
    void this.router.navigate([], { queryParams: cambio, queryParamsHandling: 'merge', replaceUrl: true });
  }
}
