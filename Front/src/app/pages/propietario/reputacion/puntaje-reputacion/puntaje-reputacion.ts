import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NivelEstacionamiento } from '@app/components/estacionamiento';
import { NOMBRE_NIVEL, ReputacionEstacionamiento, TEXTO_INSIGNIA } from '@app/models';

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

/**
 * Tarjeta principal de Reputacion (reputacion.ts): el velocimetro con el
 * puntaje, el nivel, lo que falta para el siguiente, el desglose 60/40 y las
 * insignias.
 */
@Component({
  selector: 'app-puntaje-reputacion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NivelEstacionamiento],
  templateUrl: './puntaje-reputacion.html',
  styleUrls: ['../compartido.css', './puntaje-reputacion.css'],
  host: { style: 'display: contents' },
})
export class PuntajeReputacion {
  readonly datos = input.required<ReputacionEstacionamiento>();

  protected readonly textoInsignia = TEXTO_INSIGNIA;
  protected readonly ARCO_VELOCIMETRO = ARCO;
  protected readonly MARCAS_VELOCIMETRO = MARCAS;

  /** Giro de la aguja: -120 grados en 0 puntos, +120 en 100. */
  protected anguloAguja(): number {
    const puntaje = Math.min(100, Math.max(0, this.datos().puntaje));
    return -BARRIDO / 2 + (BARRIDO * puntaje) / 100;
  }

  protected readonly cambio = computed(() => {
    const datos = this.datos();
    if (datos.puntajeAnterior == null) return null;
    const diferencia = datos.puntaje - datos.puntajeAnterior;
    if (diferencia === 0) return 'igual que el período anterior';
    return `${diferencia > 0 ? '+' : '−'}${Math.abs(diferencia)} desde el período anterior`;
  });

  /** Que le falta para tener nivel o para el siguiente, y si es destacado. */
  protected readonly estadoNivel = computed(() => {
    const datos = this.datos();
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
}
