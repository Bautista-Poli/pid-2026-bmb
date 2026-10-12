import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { Boton, Cargando, EstadoVacio, Etiqueta, Tarjeta } from '@app/components/ui';
import {
  CanalIncidencia,
  ETIQUETA_AUTOR,
  ETIQUETA_ESTADO_INCIDENCIA,
  ETIQUETA_MOTIVO_RECLAMO,
  ETIQUETA_RESOLUCION,
  ETIQUETA_TIPO_INCIDENCIA,
  IncidenciaModerada,
  MensajeIncidencia,
  ResolucionIncidencia,
} from '@app/models';
import { AdminService } from '@app/services/admin.service';

const PESOS = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });
const FUNDAMENTO_MIN = 20;
const FUNDAMENTO_MAX = 1000;

const PESTANIAS: { canal: CanalIncidencia; etiqueta: string }[] = [
  { canal: 'GENERAL', etiqueta: 'Entre las partes' },
  { canal: 'CONDUCTOR', etiqueta: 'Con el conductor' },
  { canal: 'PROPIETARIO', etiqueta: 'Con el estacionamiento' },
];

/**
 * Pantalla `/admin/disputas/:incidenciaId` · rol ADMINISTRADOR
 *
 * Una incidencia denunciada: el resumen (lo pagado, lo devuelto, los horarios
 * reales), el chat entre las partes (solo lectura), los chats privados con
 * cada una y el formulario para resolver.
 */
@Component({
  selector: 'app-disputa',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Boton, Cargando, EstadoVacio, Etiqueta, Tarjeta, RouterLink, DatePipe],
  template: `
    <div class="aparece mx-auto w-full max-w-[860px] px-6 pt-5 pb-8 lg:px-10 lg:pt-[34px] lg:pb-11">
      <div class="flex flex-col gap-5">
        <a routerLink="/admin/disputas" class="self-start text-[12.5px] font-semibold text-acento">← Disputas</a>

        @if (recurso.isLoading() && !recurso.hasValue()) {
          <ui-cargando [cantidad]="2" />
        } @else if (recurso.error(); as e) {
          <ui-estado-vacio titulo="No pudimos cargar la disputa" [descripcion]="e.message">
            <ui-boton (presionado)="recurso.reload()">Reintentar</ui-boton>
          </ui-estado-vacio>
        } @else if (recurso.value(); as d) {
          <header class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p class="eyebrow">Disputa</p>
              <h1 class="titulo-vista mt-1.5">
                {{ etiquetaTipo[d.tipo] }}
                @if (d.motivo; as motivo) {
                  <span class="font-normal text-plomo">· {{ etiquetaMotivo[motivo] }}</span>
                }
              </h1>
              <p class="mt-1 text-[13.5px] text-grafito">
                {{ d.estacionamiento.nombre }} · {{ d.conductor.nombre }}
                @if (d.patente) {
                  · {{ d.patente }}
                }
              </p>
            </div>
            <ui-etiqueta [tono]="d.estado === 'DENUNCIADA' ? 'peligro' : 'neutro'">
              {{ etiquetaEstado[d.estado] }}
            </ui-etiqueta>
          </header>

          <!-- Resumen para decidir -->
          <ui-tarjeta>
            <dl class="num-tabular grid grid-cols-2 gap-x-6 gap-y-3 text-[13px] sm:grid-cols-3">
              <div><dt class="text-plomo">Pagó</dt><dd class="font-semibold text-tinta">{{ pesos(d.pagado) }}</dd></div>
              <div><dt class="text-plomo">Ya devuelto</dt><dd class="font-semibold text-tinta">{{ pesos(d.devuelto) }}</dd></div>
              <div><dt class="text-plomo">Se puede devolver</dt><dd class="font-semibold text-tinta">{{ pesos(d.tope) }}</dd></div>
              @if (d.montoPedido !== null) {
                <div><dt class="text-plomo">Pide el conductor</dt><dd class="text-tinta">{{ pesos(d.montoPedido) }}</dd></div>
              }
              @if (d.propuestaVigente !== null) {
                <div><dt class="text-plomo">Ofreció el estacionamiento</dt><dd class="text-tinta">{{ pesos(d.propuestaVigente) }}</dd></div>
              }
              @if (d.resumen.inicio) {
                <div>
                  <dt class="text-plomo">Reserva</dt>
                  <dd class="text-tinta">{{ d.resumen.inicio | date: 'd MMM HH:mm' }} a {{ d.resumen.fin | date: 'HH:mm' }}</dd>
                </div>
                <div>
                  <dt class="text-plomo">Ingreso / egreso</dt>
                  <dd class="text-tinta">
                    {{ d.resumen.ingresoEn ? (d.resumen.ingresoEn | date: 'HH:mm') : '—' }} /
                    {{ d.resumen.egresoEn ? (d.resumen.egresoEn | date: 'HH:mm') : '—' }}
                  </dd>
                </div>
                @if (d.resumen.canceladaPor; as quien) {
                  <div><dt class="text-plomo">Cancelada por</dt><dd class="text-tinta">{{ quien.toLowerCase() }}</dd></div>
                }
              } @else if (d.resumen.desde) {
                <div>
                  <dt class="text-plomo">Abono</dt>
                  <dd class="text-tinta">{{ d.resumen.desde | date: 'd MMM' }} al {{ d.resumen.hasta | date: 'd MMM' }}</dd>
                </div>
              }
            </dl>
          </ui-tarjeta>

          <!-- Chats -->
          <ui-tarjeta relleno="ninguno">
            <div class="flex gap-1 overflow-x-auto border-b border-borde-sutil px-5 pt-2" role="tablist">
              @for (p of pestanias; track p.canal) {
                <button
                  type="button"
                  role="tab"
                  class="-mb-px shrink-0 border-b-2 px-3 py-2 text-[13px] font-semibold transition-colors duration-160"
                  [class.border-acento]="canal() === p.canal"
                  [class.text-acento]="canal() === p.canal"
                  [class.border-transparent]="canal() !== p.canal"
                  [class.text-plomo]="canal() !== p.canal"
                  [attr.aria-selected]="canal() === p.canal"
                  (click)="canal.set(p.canal)"
                >
                  {{ p.etiqueta }}
                </button>
              }
            </div>
            <p class="px-5 pt-3 text-[11.5px] text-humo">
              @if (canal() === 'GENERAL') {
                Lo que hablaron el conductor y el estacionamiento. No escribís acá: tu fundamento al resolver sí aparece.
              } @else {
                Chat privado: {{ canal() === 'CONDUCTOR' ? 'el estacionamiento' : 'el conductor' }} no lo ve.
              }
            </p>
            <ol class="flex max-h-[420px] flex-col gap-3 overflow-y-auto px-5 py-4" aria-label="Conversación">
              @for (mensaje of mensajes(); track mensaje.id) {
                @if (mensaje.rolAutor === 'SISTEMA') {
                  <li class="mx-auto max-w-[90%] rounded-control bg-lienzo px-3 py-2 text-center text-[12.5px] text-grafito">
                    {{ mensaje.texto }}
                    <span class="block text-[11px] text-humo">{{ mensaje.creadoEn | date: 'd MMM HH:mm' }}</span>
                  </li>
                } @else {
                  <li
                    class="max-w-[80%] rounded-control px-3.5 py-2 text-[13px]"
                    [class]="
                      mensaje.rolAutor === 'ADMINISTRADOR'
                        ? 'ml-auto bg-acento text-sobre-acento'
                        : 'mr-auto border border-borde bg-papel text-tinta'
                    "
                  >
                    <span class="block text-[11.5px] font-semibold opacity-80">{{ autor(mensaje) }}</span>
                    @if (mensaje.montoPropuesto !== null) {
                      <span class="num-tabular block text-[11.5px] font-semibold">Propone devolver {{ pesos(mensaje.montoPropuesto) }}</span>
                    }
                    <p class="whitespace-pre-line">{{ mensaje.texto }}</p>
                    <span class="mt-0.5 block text-[11px] opacity-70">{{ mensaje.creadoEn | date: 'd MMM HH:mm' }}</span>
                  </li>
                }
              } @empty {
                <li class="py-6 text-center text-[13px] text-plomo">Todavía no hay mensajes.</li>
              }
            </ol>
            @if (d.estado === 'DENUNCIADA' && canal() !== 'GENERAL') {
              <form class="flex items-end gap-2 border-t border-borde-sutil px-5 py-3.5" (submit)="$event.preventDefault(); escribir(d)">
                <textarea
                  rows="2"
                  maxlength="1000"
                  class="min-h-[44px] flex-1 resize-none rounded-control border border-borde bg-papel px-3.5 py-2.5
                         text-[13.5px] text-tinta placeholder:text-humo focus:border-acento focus:outline-none"
                  [placeholder]="canal() === 'CONDUCTOR' ? 'Escribile al conductor…' : 'Escribile al estacionamiento…'"
                  aria-label="Mensaje"
                  [value]="borrador()"
                  (input)="borrador.set(leer($event))"
                ></textarea>
                <ui-boton variante="primario" tipo="submit" [cargando]="enviando()" [deshabilitado]="!borrador().trim()">
                  Enviar
                </ui-boton>
              </form>
            }
          </ui-tarjeta>

          @if (error(); as mensaje) {
            <p class="text-[13px] text-ocupada" role="alert">{{ mensaje }}</p>
          }

          <!-- Resolver -->
          @if (d.estado === 'DENUNCIADA') {
            <ui-tarjeta>
              <form class="flex flex-col gap-4" (submit)="$event.preventDefault(); resolver(d)">
                <h2 class="text-[15px] font-semibold text-tinta">Resolver</h2>
                <fieldset class="flex flex-col gap-2 text-[13.5px] text-tinta">
                  <legend class="label-campo mb-1">A favor de</legend>
                  <label class="flex items-center gap-2">
                    <input type="radio" name="resolucion" [checked]="resolucion() === 'A_FAVOR_CONDUCTOR'" (change)="resolucion.set('A_FAVOR_CONDUCTOR')" />
                    El conductor (se le devuelve plata)
                  </label>
                  <label class="flex items-center gap-2">
                    <input type="radio" name="resolucion" [checked]="resolucion() === 'A_FAVOR_PROPIETARIO'" (change)="resolucion.set('A_FAVOR_PROPIETARIO')" />
                    El estacionamiento (sin devolución)
                  </label>
                </fieldset>
                @if (resolucion() === 'A_FAVOR_CONDUCTOR') {
                  <label class="campo">
                    <span class="label-campo">Monto a devolver</span>
                    <input type="number" inputmode="decimal" min="1" [max]="d.tope" [value]="monto() ?? ''" (input)="leerMonto($event)" />
                    <span class="campo-ayuda num-tabular">Hasta {{ pesos(d.tope) }}. Se aplica en el acto y se descuenta de los ingresos del estacionamiento.</span>
                  </label>
                }
                <label class="campo">
                  <span class="label-campo">Fundamento (lo leen las dos partes)</span>
                  <textarea
                    rows="3"
                    [maxLength]="fundamentoMax"
                    class="rounded-control border border-borde bg-papel px-3.5 py-3 text-[14px] text-tinta
                           placeholder:text-humo focus:border-acento focus:outline-none"
                    [value]="fundamento()"
                    (input)="fundamento.set(leer($event))"
                  ></textarea>
                  <span class="campo-ayuda num-tabular">{{ fundamento().trim().length }}/{{ fundamentoMax }} · mínimo {{ fundamentoMin }}</span>
                </label>
                <ui-boton variante="primario" tipo="submit" [bloque]="true" [cargando]="resolviendo()" [deshabilitado]="!resolucionValida(d)">
                  Resolver disputa
                </ui-boton>
              </form>
            </ui-tarjeta>
          } @else if (d.resolucion; as resolucion) {
            <p class="text-[13px] text-plomo">
              Resuelta el {{ d.resueltaEn | date: 'd MMM HH:mm' }}: <span class="font-semibold text-tinta">{{ etiquetaResolucion[resolucion] }}</span>.
            </p>
          }
        }
      </div>
    </div>
  `,
})
export class Disputa {
  private readonly admin = inject(AdminService);
  private readonly router = inject(Router);

  /** Del path `/admin/disputas/:incidenciaId` (withComponentInputBinding). */
  readonly incidenciaId = input.required<string>();

  protected readonly pestanias = PESTANIAS;
  protected readonly etiquetaTipo = ETIQUETA_TIPO_INCIDENCIA;
  protected readonly etiquetaEstado = ETIQUETA_ESTADO_INCIDENCIA;
  protected readonly etiquetaMotivo = ETIQUETA_MOTIVO_RECLAMO;
  protected readonly etiquetaResolucion = ETIQUETA_RESOLUCION;
  protected readonly fundamentoMin = FUNDAMENTO_MIN;
  protected readonly fundamentoMax = FUNDAMENTO_MAX;
  protected readonly pesos = (monto: number) => `$ ${PESOS.format(monto)}`;

  protected readonly recurso = rxResource({
    params: () => this.incidenciaId(),
    stream: ({ params }) => this.admin.incidencia(params),
  });

  protected readonly canal = signal<CanalIncidencia>('GENERAL');
  protected readonly mensajes = computed(() =>
    (this.recurso.value()?.mensajes ?? []).filter((m) => m.canal === this.canal()),
  );

  protected readonly borrador = signal('');
  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly resolucion = signal<ResolucionIncidencia | null>(null);
  protected readonly monto = signal<number | null>(null);
  protected readonly fundamento = signal('');
  protected readonly resolviendo = signal(false);

  protected autor(mensaje: MensajeIncidencia): string {
    const rol = mensaje.rolAutor === 'ADMINISTRADOR' ? 'Vos (moderación)' : ETIQUETA_AUTOR[mensaje.rolAutor];
    return mensaje.autor && mensaje.rolAutor !== 'ADMINISTRADOR' ? `${mensaje.autor} · ${rol}` : rol;
  }

  protected leer(evento: Event): string {
    return (evento.target as HTMLTextAreaElement).value;
  }

  protected leerMonto(evento: Event): void {
    const valor = (evento.target as HTMLInputElement).value;
    this.monto.set(valor === '' ? null : Number(valor));
  }

  protected resolucionValida(d: IncidenciaModerada): boolean {
    const largo = this.fundamento().trim().length;
    if (largo < FUNDAMENTO_MIN || largo > FUNDAMENTO_MAX) return false;
    if (this.resolucion() === 'A_FAVOR_PROPIETARIO') return true;
    const monto = this.monto();
    return this.resolucion() === 'A_FAVOR_CONDUCTOR' && monto !== null && monto > 0 && monto <= d.tope;
  }

  protected escribir(d: IncidenciaModerada): void {
    const texto = this.borrador().trim();
    const canal = this.canal();
    if (!texto || canal === 'GENERAL' || this.enviando()) return;
    this.enviando.set(true);
    this.error.set(null);
    this.admin.escribir(d.id, texto, canal).subscribe({
      next: (actualizada) => {
        this.enviando.set(false);
        this.borrador.set('');
        this.recurso.set(actualizada);
      },
      error: (e: Error) => {
        this.enviando.set(false);
        this.error.set(e.message);
      },
    });
  }

  protected resolver(d: IncidenciaModerada): void {
    const resolucion = this.resolucion();
    if (!resolucion || !this.resolucionValida(d) || this.resolviendo()) return;
    this.resolviendo.set(true);
    this.error.set(null);
    this.admin
      .resolverIncidencia(d.id, {
        resolucion,
        ...(resolucion === 'A_FAVOR_CONDUCTOR' ? { monto: this.monto() ?? 0 } : {}),
        fundamento: this.fundamento().trim(),
      })
      .subscribe({
        next: () => {
          this.resolviendo.set(false);
          void this.router.navigate(['/admin/disputas']);
        },
        error: (e: Error) => {
          this.resolviendo.set(false);
          this.error.set(e.message);
        },
      });
  }
}
