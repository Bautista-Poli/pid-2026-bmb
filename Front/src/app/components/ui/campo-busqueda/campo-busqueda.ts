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
import { Sugerencia } from '../campo-autocompletar/campo-autocompletar';
import { Icono } from '../icono/icono';

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
  selector: 'ui-campo-busqueda',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icono],
  template: `
    <label
      class="group flex items-center gap-2.5 rounded-control border border-borde bg-papel px-3.5 py-3
             shadow-tarjeta transition-[border-color,box-shadow] duration-160 ease-out
             hover:border-acento-borde focus-within:border-acento
             focus-within:ring-[3px] focus-within:ring-acento-suave lg:py-[11px]"
    >
      <span class="sr-only">{{ etiqueta() }}</span>

      <svg
        class="size-4 shrink-0 text-humo transition-colors duration-160 ease-out
               group-focus-within:text-acento"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        aria-hidden="true"
      >
        <circle cx="7" cy="7" r="5" />
        <path d="m10.8 10.8 3 3" stroke-linecap="round" />
      </svg>

      <input
        type="search"
        autocomplete="off"
        class="w-full border-0 bg-transparent text-sm text-tinta placeholder:text-humo
               focus:outline-none lg:text-[13.5px]"
        [attr.role]="buscar() ? 'combobox' : null"
        [attr.aria-autocomplete]="buscar() ? 'list' : null"
        [attr.aria-expanded]="buscar() ? abierta() : null"
        [attr.aria-controls]="buscar() ? idLista : null"
        [attr.aria-activedescendant]="abierta() && activa() >= 0 ? idLista + '-' + activa() : null"
        [placeholder]="marcador()"
        [value]="valor()"
        (input)="escribir($any($event.target).value)"
        (keydown)="teclear($event)"
        (blur)="abierta.set(false)"
      />
    </label>

    @if (abierta()) {
      <ul
        role="listbox"
        class="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-control border
               border-borde bg-papel py-1 shadow-flotante"
        [id]="idLista"
      >
        @for (sugerencia of sugerencias(); track $index; let i = $index) {
          <li
            role="option"
            class="flex cursor-pointer items-center gap-3 px-3.5 py-2.5 text-tinta"
            [class.bg-acento-suave]="i === activa()"
            [id]="idLista + '-' + i"
            [attr.aria-selected]="i === activa()"
            (mousedown)="$event.preventDefault()"
            (click)="elegir(sugerencia)"
            (mouseenter)="activa.set(i)"
          >
            @if (sugerencia.icono; as icono) {
              <span
                class="grid size-8 shrink-0 place-items-center rounded-full bg-borde-sutil text-plomo"
                aria-hidden="true"
              >
                <ui-icono [nombre]="icono" [tamano]="17" />
              </span>
            }
            <span class="min-w-0">
              <span class="block truncate text-[14px] font-medium">{{ sugerencia.nombre }}</span>
              @if (sugerencia.detalle) {
                <span class="block truncate text-[12px] text-plomo">{{ sugerencia.detalle }}</span>
              }
            </span>
          </li>
        }
      </ul>
    }
  `,
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
