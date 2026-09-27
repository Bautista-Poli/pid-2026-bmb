import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  forwardRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { Observable, Subject, catchError, debounceTime, of, switchMap, tap } from 'rxjs';

export interface Sugerencia<T = unknown> {
  /** Lo que se escribe en el campo y queda como valor del control. */
  nombre: string;
  /** Texto chico a la derecha, para distinguir opciones con el mismo nombre. */
  detalle?: string;
  /** Lo que quiera guardar quien usa el campo (por ejemplo, un id). */
  dato?: T;
}

let siguienteId = 0;

/**
 * Campo de texto que solo acepta un valor elegido de la lista de sugerencias.
 *
 * Se usa como cualquier control de formulario (`formControlName`). Mientras la
 * persona escribe, el valor del control es `''` (asi un `Validators.required`
 * lo marca invalido); recien al elegir una sugerencia pasa a ser su `nombre`.
 * Va dentro de un contenedor `.campo`, que le da el estilo al input.
 */
@Component({
  selector: 'ui-campo-autocompletar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => CampoAutocompletar), multi: true },
  ],
  template: `
    <input
      type="text"
      role="combobox"
      autocomplete="off"
      aria-autocomplete="list"
      class="w-full"
      [id]="idCampo()"
      [attr.aria-expanded]="abierta()"
      [attr.aria-controls]="idLista"
      [attr.aria-activedescendant]="activa() >= 0 ? idLista + '-' + activa() : null"
      [placeholder]="marcador()"
      [value]="texto()"
      [disabled]="deshabilitado()"
      (input)="escribir($any($event.target).value)"
      (keydown)="teclear($event)"
      (focus)="abrirSiHayTexto()"
      (blur)="salir()"
    />

    @if (abierta()) {
      <ul
        role="listbox"
        class="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-auto rounded-control border
               border-borde bg-papel py-1 shadow-flotante"
        [id]="idLista"
      >
        @if (buscando()) {
          <li class="px-3.5 py-2.5 text-[13px] text-plomo">Buscando…</li>
        } @else if (error()) {
          <li class="px-3.5 py-2.5 text-[13px] text-ocupada">No pudimos buscar. Probá de nuevo.</li>
        } @else {
          @for (sugerencia of sugerencias(); track $index; let i = $index) {
            <li
              role="option"
              class="flex cursor-pointer items-baseline justify-between gap-3 px-3.5 py-2.5 text-[14px]
                     text-tinta"
              [class.bg-acento-suave]="i === activa()"
              [id]="idLista + '-' + i"
              [attr.aria-selected]="i === activa()"
              (mousedown)="$event.preventDefault()"
              (click)="elegir(sugerencia)"
              (mouseenter)="activa.set(i)"
            >
              <span>{{ sugerencia.nombre }}</span>
              @if (sugerencia.detalle) {
                <span class="shrink-0 text-[12px] text-plomo">{{ sugerencia.detalle }}</span>
              }
            </li>
          } @empty {
            <li class="px-3.5 py-2.5 text-[13px] text-plomo">{{ sinResultados() }}</li>
          }
        }
      </ul>
    }
  `,
  host: { class: 'relative block' },
})
export class CampoAutocompletar implements ControlValueAccessor {
  /** Busca las sugerencias para un texto. */
  readonly buscar = input.required<(texto: string) => Observable<Sugerencia[]>>();
  readonly marcador = input('');
  readonly idCampo = input(`autocompletar-${siguienteId}`);
  /** Cuantas letras hay que escribir antes de buscar. */
  readonly minimo = input(2);
  readonly sinResultados = input('No hay coincidencias');

  /** Se emite al elegir una sugerencia, con su `dato`. */
  readonly elegida = output<Sugerencia>();

  protected readonly idLista = `autocompletar-lista-${siguienteId++}`;
  protected readonly texto = signal('');
  protected readonly sugerencias = signal<Sugerencia[]>([]);
  protected readonly abierta = signal(false);
  protected readonly activa = signal(-1);
  protected readonly buscando = signal(false);
  protected readonly error = signal(false);
  protected readonly deshabilitado = signal(false);

  private readonly busquedas = new Subject<string>();
  private alCambiar: (valor: string) => void = () => {};
  private alTocar: () => void = () => {};

  constructor() {
    this.busquedas
      .pipe(
        tap(() => this.error.set(false)),
        debounceTime(250),
        switchMap((texto) => {
          if (texto.trim().length < this.minimo()) {
            this.buscando.set(false);
            return of([]);
          }
          return this.buscar()(texto.trim()).pipe(
            catchError(() => {
              this.error.set(true);
              return of([]);
            }),
          );
        }),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe((sugerencias) => {
        this.buscando.set(false);
        this.sugerencias.set(sugerencias);
        this.activa.set(sugerencias.length > 0 ? 0 : -1);
      });
  }

  protected escribir(texto: string): void {
    this.texto.set(texto);
    // Lo escrito a mano no es un valor valido hasta que se elija de la lista.
    this.alCambiar('');
    const buscar = texto.trim().length >= this.minimo();
    this.abierta.set(buscar);
    this.buscando.set(buscar);
    this.busquedas.next(texto);
  }

  protected abrirSiHayTexto(): void {
    if (this.texto().trim().length >= this.minimo() && this.sugerencias().length > 0) {
      this.abierta.set(true);
    }
  }

  protected teclear(evento: KeyboardEvent): void {
    const cantidad = this.sugerencias().length;
    switch (evento.key) {
      case 'ArrowDown':
        evento.preventDefault();
        if (!this.abierta()) this.abrirSiHayTexto();
        else if (cantidad) this.activa.update((i) => (i + 1) % cantidad);
        break;
      case 'ArrowUp':
        evento.preventDefault();
        if (cantidad) this.activa.update((i) => (i - 1 + cantidad) % cantidad);
        break;
      case 'Enter': {
        const sugerencia = this.sugerencias()[this.activa()];
        if (this.abierta() && sugerencia && !this.buscando()) {
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
    this.texto.set(sugerencia.nombre);
    this.abierta.set(false);
    this.alCambiar(sugerencia.nombre);
    this.alTocar();
    this.elegida.emit(sugerencia);
  }

  protected salir(): void {
    this.abierta.set(false);
    this.alTocar();
  }

  /* ------------------------- ControlValueAccessor -------------------------- */

  writeValue(valor: string | null): void {
    this.texto.set(valor ?? '');
    this.sugerencias.set([]);
    this.abierta.set(false);
  }

  registerOnChange(fn: (valor: string) => void): void {
    this.alCambiar = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.alTocar = fn;
  }

  setDisabledState(deshabilitado: boolean): void {
    this.deshabilitado.set(deshabilitado);
  }
}
