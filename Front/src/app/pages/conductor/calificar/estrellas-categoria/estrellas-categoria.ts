import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CATEGORIAS_CALIFICACION } from '@app/models';

const ESTRELLAS = [1, 2, 3, 4, 5] as const;

/**
 * Una fila del formulario de Calificar (calificar.ts): nombre y ayuda de la
 * categoria y sus 5 estrellas. Avisa con `notaChange` la estrella elegida.
 */
@Component({
  selector: 'app-estrellas-categoria',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './estrellas-categoria.html',
  styleUrl: './estrellas-categoria.css',
})
export class EstrellasCategoria {
  readonly categoria = input.required<(typeof CATEGORIAS_CALIFICACION)[number]>();
  /** 0 mientras no eligio ninguna. */
  readonly nota = input(0);

  readonly notaChange = output<number>();

  protected readonly estrellas = ESTRELLAS;

  protected etiquetaEstrella(valor: number): string {
    return `${this.categoria().nombre}: ${valor} ${valor === 1 ? 'estrella' : 'estrellas'}`;
  }
}
