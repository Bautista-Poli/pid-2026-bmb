import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Tarjeta } from '@app/components/ui';
import {
  CategoriaReputacion,
  EtiquetaCalificacion,
  ReputacionEstacionamiento,
  TEXTO_ETIQUETA,
  formatearNota,
} from '@app/models';

/**
 * Lo que califican los conductores en Reputacion (reputacion.ts): el promedio
 * de cada categoria con su tendencia y las etiquetas mas marcadas.
 */
@Component({
  selector: 'app-categorias-reputacion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Tarjeta],
  templateUrl: './categorias-reputacion.html',
  styleUrls: ['../compartido.css', './categorias-reputacion.css'],
  host: { style: 'display: contents' },
})
export class CategoriasReputacion {
  readonly datos = input.required<ReputacionEstacionamiento>();

  protected readonly nota = formatearNota;

  protected tendencia(categoria: CategoriaReputacion): { texto: string; clase: string } {
    if (categoria.promedio == null || categoria.anterior == null) return { texto: '', clase: '' };
    const diferencia = Math.round((categoria.promedio - categoria.anterior) * 10) / 10;
    if (diferencia === 0) return { texto: 'igual', clase: 'tendencia-igual' };
    return diferencia > 0
      ? { texto: `+${formatearNota(diferencia)}`, clase: 'tendencia-sube' }
      : { texto: `−${formatearNota(-diferencia)}`, clase: 'tendencia-baja' };
  }

  /** Las etiquetas que marcaron alguna vez, mas marcadas primero. */
  protected readonly etiquetasMarcadas = computed(() =>
    this.datos().etiquetas.filter((e) => e.cantidad > 0).sort((a, b) => b.cantidad - a.cantidad),
  );

  protected textoDeEtiqueta(codigo: EtiquetaCalificacion): string {
    return TEXTO_ETIQUETA[codigo];
  }
}
