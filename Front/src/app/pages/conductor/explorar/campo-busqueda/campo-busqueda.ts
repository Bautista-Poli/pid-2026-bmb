import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, Subject, catchError, debounceTime, of, switchMap } from 'rxjs';
import { Icono, NombreIcono } from '@app/components/ui';

/** Una opcion de la lista de sugerencias del buscador. */
export interface Sugerencia<T = unknown> {
  /** Lo que se muestra en la lista. */
  nombre: string;
  /** Texto chico a la derecha, para distinguir opciones con el mismo nombre. */
  detalle?: string;
  /** Lo que quiera guardar quien usa el campo (por ejemplo, el destino elegido). */
  dato?: T;
  /** Icono que dice que tipo de lugar es (calle, plaza, barrio...). */
  icono?: NombreIcono;
}

let siguienteId = 0;

/**
 * Buscador: fila blanca, borde 1px, radio 10px, icono de lupa a la izquierda.
 *
 * Lo que se escribe sale por `valor` (filtra al instante). Si ademas recibe
 * `buscar`, muestra debajo una lista de sugerencias (desde `minimo` letras,
 * como Google Maps); elegir una emite `elegida` y no toca `valor` (quien lo usa
 * decide que mostrar en el campo).
 */
@Component({
  selector: 'app-campo-busqueda',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icono],
  templateUrl: './campo-busqueda.html',
  styleUrl: './campo-busqueda.css',
  host: { class: 'relative block' },
})
export class CampoBusqueda {
  readonly valor = model<string>('');
  readonly marcador = input('Buscar por zona o dirección');
  readonly etiqueta = input('Buscar');
  /** Cuantas letras hay que escribir antes de pedir sugerencias. */
  readonly minimo = input(1);
  /** Opcional: sugerencias para lo escrito. Si devuelve `[]`, la lista no se muestra. */
  readonly buscar = input<((texto: string) => Observable<Sugerencia[]>) | null>(null);

  readonly elegida = output<Sugerencia>();

  protected readonly idLista = `busqueda-lista-${siguienteId++}`;
  protected readonly sugerencias = signal<Sugerencia[]>([]);
  protected readonly abierta = signal(false);
  protected readonly activa = signal(-1);

  private readonly busquedas = new Subject<string>();

  constructor() {
    this.busquedas
      .pipe(
        debounceTime(300),
        switchMap((texto) => {
          const buscar = this.buscar();
          if (!buscar || texto.trim().length < this.minimo()) return of([]);
          return buscar(texto.trim()).pipe(catchError(() => of([])));
        }),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe((sugerencias) => {
        this.sugerencias.set(sugerencias);
        this.activa.set(sugerencias.length > 0 ? 0 : -1);
        this.abierta.set(sugerencias.length > 0);
      });
  }

  protected escribir(texto: string): void {
    this.valor.set(texto);
    this.abierta.set(false);
    this.busquedas.next(texto);
  }

  /** Flechas para moverse por las sugerencias, Enter para elegir y Escape para cerrar. */
  protected teclear(evento: KeyboardEvent): void {
    if (!this.abierta()) return;
    const cantidad = this.sugerencias().length;
    switch (evento.key) {
      case 'ArrowDown':
        evento.preventDefault();
        this.activa.update((i) => (i + 1) % cantidad);
        break;
      case 'ArrowUp':
        evento.preventDefault();
        this.activa.update((i) => (i - 1 + cantidad) % cantidad);
        break;
      case 'Enter': {
        const sugerencia = this.sugerencias()[this.activa()];
        if (sugerencia) {
          evento.preventDefault();
          this.elegir(sugerencia);
        }
        break;
      }
      case 'Escape':
        this.abierta.set(false);
        break;
    }
  }

  protected elegir(sugerencia: Sugerencia): void {
    this.abierta.set(false);
    this.sugerencias.set([]);
    this.elegida.emit(sugerencia);
  }
}
