import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { NivelEstacionamiento } from '@app/components/estacionamiento';
import { DenunciarResena } from '@app/components/reclamo';
import { Boton, Cargando, EstadoVacio, Tarjeta } from '@app/components/ui';
import {
  CategoriaReputacion,
  Estacionamiento,
  EtiquetaCalificacion,
  Id,
  PeriodoReputacion,
  ReputacionEstacionamiento,
  TEXTO_ESTADO_DENUNCIA,
  TEXTO_ETIQUETA,
  TEXTO_INSIGNIA,
  NOMBRE_NIVEL,
  formatearNota,
} from '@app/models';
import { AuthService } from '@app/services/auth.service';
import { CalificacionService } from '@app/services/calificacion.service';
import { EstacionamientoService } from '@app/services/estacionamiento.service';

const PERIODOS: { dias: PeriodoReputacion; etiqueta: string }[] = [
  { dias: 30, etiqueta: 'Últimos 30 días' },
  { dias: 90, etiqueta: 'Últimos 90 días' },
];

/** Velocimetro del puntaje: centro (60, 60), radio 48, barrido de 240 grados. */
const CENTRO = 60;
const RADIO = 48;
const BARRIDO = 240;

/** Punto a `radio` del centro, girado `grados` desde las 12 en sentido horario. */
function punto(grados: number, radio: number): { x: number; y: number } {
  const rad = (grados * Math.PI) / 180;
  return { x: CENTRO + radio * Math.sin(rad), y: CENTRO - radio * Math.cos(rad) };
}

const INICIO = punto(-BARRIDO / 2, RADIO);
const FIN = punto(BARRIDO / 2, RADIO);
const ARCO = `M ${INICIO.x} ${INICIO.y} A ${RADIO} ${RADIO} 0 1 1 ${FIN.x} ${FIN.y}`;

/** Una marca cada 10 puntos; las de 0, 50 y 100 son mas largas. */
const MARCAS = Array.from({ length: 11 }, (_, i) => {
  const grados = -BARRIDO / 2 + (BARRIDO * i) / 10;
  const mayor = i % 5 === 0;
  const desde = punto(grados, mayor ? 32 : 35);
  const hasta = punto(grados, 39);
  return { x1: desde.x, y1: desde.y, x2: hasta.x, y2: hasta.y, mayor };
});

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
  imports: [Boton, Cargando, DenunciarResena, EstadoVacio, NivelEstacionamiento, RouterLink, Tarjeta],
  templateUrl: './reputacion.html',
  styleUrl: './reputacion.css',
})
export class Reputacion {
  private readonly calificaciones = inject(CalificacionService);
  private readonly estacionamientos = inject(EstacionamientoService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

  protected readonly periodos = PERIODOS;
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

  protected readonly ARCO_VELOCIMETRO = ARCO;
  protected readonly MARCAS_VELOCIMETRO = MARCAS;

  /** Giro de la aguja: -120 grados en 0 puntos, +120 en 100. */
  protected anguloAguja(datos: ReputacionEstacionamiento): number {
    const puntaje = Math.min(100, Math.max(0, datos.puntaje));
    return -BARRIDO / 2 + (BARRIDO * puntaje) / 100;
  }

  protected readonly cambio = computed(() => {
    const datos = this.recurso.value();
    if (!datos || datos.puntajeAnterior == null) return null;
    const diferencia = datos.puntaje - datos.puntajeAnterior;
    if (diferencia === 0) return 'igual que el período anterior';
    return `${diferencia > 0 ? '+' : '−'}${Math.abs(diferencia)} desde el período anterior`;
  });

  /** Que le falta para tener nivel o para el siguiente, y si es destacado. */
  protected readonly estadoNivel = computed(() => {
    const datos = this.recurso.value();
    if (!datos) return '';
    const faltanCalificaciones = datos.minimoCalificaciones - datos.calificaciones.cantidad;
    if (!datos.nivel) {
      return faltanCalificaciones === 1
        ? 'Te falta 1 calificación para tener nivel.'
        : `Te faltan ${faltanCalificaciones} calificaciones para tener nivel.`;
    }
    const siguiente = datos.siguienteNivel;
    if (!siguiente) return 'Llegaste al nivel máximo. Mantenelo para no bajar.';
    const puntos = siguiente.faltan === 1 ? '1 punto' : `${siguiente.faltan} puntos`;
    return `Te faltan ${puntos} para ${NOMBRE_NIVEL[siguiente.codigo]}.`;
  });

  /** "80 a 87" / "95 o más" */
  protected rango(datos: ReputacionEstacionamiento, indice: number): string {
    const actual = datos.niveles[indice];
    const siguiente = datos.niveles[indice + 1];
    return siguiente ? `${actual.desde} a ${siguiente.desde - 1}` : `${actual.desde} o más`;
  }

  /** Si ese nivel ya quedo atras (o es el actual). Sin nivel, ninguno. */
  protected alcanzado(datos: ReputacionEstacionamiento, indice: number): boolean {
    if (!datos.nivel) return false;
    return indice <= datos.niveles.findIndex((n) => n.codigo === datos.nivel);
  }

  protected tendencia(categoria: CategoriaReputacion): { texto: string; clase: string } {
    if (categoria.promedio == null || categoria.anterior == null) return { texto: '', clase: '' };
    const diferencia = Math.round((categoria.promedio - categoria.anterior) * 10) / 10;
    if (diferencia === 0) return { texto: 'igual', clase: 'tendencia-igual' };
    return diferencia > 0
      ? { texto: `+${formatearNota(diferencia)}`, clase: 'tendencia-sube' }
      : { texto: `−${formatearNota(-diferencia)}`, clase: 'tendencia-baja' };
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

  /* --------------------------- denuncia de reseñas -------------------------- */

  protected readonly textoEstadoDenuncia = TEXTO_ESTADO_DENUNCIA;
  /** Opinion que se esta denunciando: abre el modal. */
  protected readonly aDenunciar = signal<Id | null>(null);

  protected opinionDenunciada(): void {
    this.aDenunciar.set(null);
    this.recurso.reload();
  }
}
