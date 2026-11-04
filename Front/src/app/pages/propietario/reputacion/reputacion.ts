import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { Boton, Cargando, EstadoVacio, Tarjeta } from '@app/components/ui';
import {
  CategoriaReputacion,
  Estacionamiento,
  EtiquetaCalificacion,
  PeriodoReputacion,
  ReputacionEstacionamiento,
  TEXTO_ETIQUETA,
  TEXTO_INSIGNIA,
  formatearNota,
} from '@app/models';
import { AuthService } from '@app/services/auth.service';
import { CalificacionService } from '@app/services/calificacion.service';
import { EstacionamientoService } from '@app/services/estacionamiento.service';

const PERIODOS: { dias: PeriodoReputacion; etiqueta: string }[] = [
  { dias: 30, etiqueta: 'Últimos 30 días' },
  { dias: 90, etiqueta: 'Últimos 90 días' },
];

/** Perimetro del anillo del puntaje (r = 44). */
const PERIMETRO = 2 * Math.PI * 44;

const FECHA_CORTA = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short' });

/** "hace 2 días", "hace 3 h", "12 oct". */
function haceCuanto(instante: string, ahora = Date.now()): string {
  const minutos = Math.max(0, Math.round((ahora - Date.parse(instante)) / 60_000));
  if (minutos < 60) return minutos <= 1 ? 'recién' : `hace ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.round(horas / 24);
  if (dias < 7) return dias === 1 ? 'ayer' : `hace ${dias} días`;
  return FECHA_CORTA.format(new Date(instante)).replace('.', '');
}

interface FilaOperacion {
  titulo: string;
  valor: string;
  detalle: string;
  puntos: number;
}

/**
 * Pantalla `/propietario/reputacion` · rol PROPIETARIO
 *
 * El puntaje de 0 a 100 de un estacionamiento: 60 por lo que califican los
 * conductores y 40 por como opera (lo mide Parkit). Desde 80, con suficientes
 * calificaciones, es "Anfitrion destacado": insignia dorada en la busqueda y el
 * mapa, y aparece primero. El estacionamiento y el periodo viven en la URL.
 */
@Component({
  selector: 'app-reputacion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Boton, Cargando, EstadoVacio, RouterLink, Tarjeta],
  templateUrl: './reputacion.html',
})
export class Reputacion {
  private readonly calificaciones = inject(CalificacionService);
  private readonly estacionamientos = inject(EstacionamientoService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

  protected readonly periodos = PERIODOS;
  protected readonly perimetro = PERIMETRO;
  protected readonly textoEtiqueta = TEXTO_ETIQUETA;
  protected readonly textoInsignia = TEXTO_INSIGNIA;
  protected readonly nota = formatearNota;
  protected readonly haceCuanto = haceCuanto;

  private readonly params = toSignal(this.ruta.queryParamMap, { requireSync: true });

  protected readonly dias = computed<PeriodoReputacion>(() => (this.params().get('dias') === '90' ? 90 : 30));

  protected readonly recursoEstacionamientos = rxResource({
    params: () => this.auth.usuario()?.id,
    stream: () => this.estacionamientos.listarDelPropietario().pipe(map((lista) => lista.filter((e) => e.activo))),
    defaultValue: [] as Estacionamiento[],
  });

  /** El de la URL o, si no vino, el primero. */
  protected readonly estacionamientoId = computed(
    () => this.params().get('estacionamiento') ?? this.recursoEstacionamientos.value()[0]?.id ?? null,
  );

  protected readonly nombre = computed(
    () => this.recursoEstacionamientos.value().find((e) => e.id === this.estacionamientoId())?.nombre ?? '',
  );

  protected readonly recurso = rxResource({
    params: () => {
      const id = this.estacionamientoId();
      return id ? { id, dias: this.dias() } : undefined;
    },
    stream: ({ params }) => this.calificaciones.reputacion(params.id, params.dias),
  });

  /** Largo del arco dorado del anillo. */
  protected arco(datos: ReputacionEstacionamiento): string {
    return `${(datos.puntaje / 100) * PERIMETRO} ${PERIMETRO}`;
  }

  protected readonly cambio = computed(() => {
    const datos = this.recurso.value();
    if (!datos || datos.puntajeAnterior == null) return null;
    const diferencia = datos.puntaje - datos.puntajeAnterior;
    if (diferencia === 0) return 'igual que el período anterior';
    return `${diferencia > 0 ? '+' : '−'}${Math.abs(diferencia)} desde el período anterior`;
  });

  /** Que le falta para la insignia, o como conservarla. */
  protected readonly estadoInsignia = computed(() => {
    const datos = this.recurso.value();
    if (!datos) return '';
    if (datos.destacado) return `Mantenelo en ${datos.umbralDestacado} o más para conservar la insignia.`;
    const faltanPuntos = Math.max(0, datos.umbralDestacado - datos.puntaje);
    const faltanCalificaciones = Math.max(0, datos.minimoCalificaciones - datos.calificaciones.cantidad);
    const partes = [
      { n: faltanPuntos, uno: 'punto', varios: 'puntos' },
      { n: faltanCalificaciones, uno: 'calificación', varios: 'calificaciones' },
    ].filter((p) => p.n > 0);
    const texto = partes.map((p) => `${p.n} ${p.n === 1 ? p.uno : p.varios}`).join(' y ');
    const verbo = partes.length === 1 && partes[0].n === 1 ? 'falta' : 'faltan';
    return `Te ${verbo} ${texto} para ser Anfitrión destacado.`;
  });

  protected tendencia(categoria: CategoriaReputacion): { texto: string; clase: string } {
    if (categoria.promedio == null || categoria.anterior == null) return { texto: '', clase: '' };
    const diferencia = Math.round((categoria.promedio - categoria.anterior) * 10) / 10;
    if (diferencia === 0) return { texto: 'igual', clase: 'text-plomo' };
    return diferencia > 0
      ? { texto: `+${formatearNota(diferencia)}`, clase: 'text-exito' }
      : { texto: `−${formatearNota(-diferencia)}`, clase: 'text-ocupada' };
  }

  protected readonly filasOperacion = computed<FilaOperacion[]>(() => {
    const datos = this.recurso.value();
    if (!datos) return [];
    const { confirmacion, incidencias, respuesta, cancelaciones } = datos.operacion;
    return [
      {
        titulo: 'Confirmadas a tiempo',
        valor: `${confirmacion.porcentaje}%`,
        detalle:
          confirmacion.vencidas === 0
            ? 'Ninguna vencida sin confirmar'
            : `${confirmacion.vencidas} de ${confirmacion.reservas} vencieron sin confirmar`,
        puntos: confirmacion.puntos,
      },
      {
        titulo: 'Incidencias sin denuncia',
        valor: incidencias.total === 0 ? '—' : `${incidencias.sinDenuncia} de ${incidencias.total}`,
        detalle: incidencias.total === 0 ? 'No hubo incidencias' : 'Se arreglaron en el chat',
        puntos: incidencias.puntos,
      },
      {
        titulo: 'Respuesta en el chat',
        valor: respuesta.minutos == null ? '—' : `${respuesta.minutos} min`,
        detalle:
          respuesta.minutos == null
            ? 'Sin incidencias para responder'
            : respuesta.minutos <= 10
              ? 'Respondés rápido'
              : 'Respondé en menos de 10 min para sumar todo',
        puntos: respuesta.puntos,
      },
      {
        titulo: 'Cancelaciones propias',
        valor: String(cancelaciones.propias),
        detalle: cancelaciones.propias === 0 ? 'No cancelaste reservas' : 'Cada cancelación tuya resta',
        puntos: cancelaciones.puntos,
      },
    ];
  });

  /** Las etiquetas que marcaron alguna vez, mas marcadas primero. */
  protected readonly etiquetasMarcadas = computed(() =>
    (this.recurso.value()?.etiquetas ?? []).filter((e) => e.cantidad > 0).sort((a, b) => b.cantidad - a.cantidad),
  );

  protected textoDeEtiqueta(codigo: EtiquetaCalificacion): string {
    return TEXTO_ETIQUETA[codigo];
  }

  protected elegirPeriodo(dias: PeriodoReputacion): void {
    void this.router.navigate([], { queryParams: { dias }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  protected elegirEstacionamiento(evento: Event): void {
    const estacionamiento = (evento.target as HTMLSelectElement).value || null;
    void this.router.navigate([], { queryParams: { estacionamiento }, queryParamsHandling: 'merge', replaceUrl: true });
  }
}
