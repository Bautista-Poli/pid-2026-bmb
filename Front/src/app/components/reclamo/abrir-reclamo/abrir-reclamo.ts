import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Boton, Modal } from '@app/components/ui';
import { ETIQUETA_MOTIVO_RECLAMO, Id, MotivoReclamo } from '@app/models';
import { IncidenciaService } from '@app/services/incidencia.service';

/** Sobre que se reclama: una reserva pagada aparte o un abono. */
export interface ObjetoReclamo {
  tipo: 'reserva' | 'abono';
  id: Id;
  /** "Centro · 18 oct 08:00": para que el conductor sepa que esta reclamando. */
  descripcion: string;
  /** Lo que queda por devolver (lo pagado menos lo ya devuelto). */
  tope: number;
}

const TEXTO_MIN = 20;
const TEXTO_MAX = 1000;

/**
 * Modal "Tengo un problema": el conductor abre un reclamo con motivo, monto
 * pedido opcional (hasta lo pagado) y una descripcion, que es el primer
 * mensaje del hilo con el estacionamiento.
 */
@Component({
  selector: 'app-abrir-reclamo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Boton, Modal, FormsModule],
  template: `
    <ui-modal titulo="Tengo un problema" [abierto]="objeto() !== null" (cerrado)="cerrar()">
      @if (objeto(); as o) {
        <form class="flex flex-col gap-4" (ngSubmit)="enviar(o)">
          <p class="text-[13.5px] text-grafito">
            {{ o.descripcion }}. Primero lo hablás con el estacionamiento; si no se ponen de acuerdo,
            cualquiera puede pedir que intervenga Parkit.
          </p>

          <label class="campo">
            <span class="label-campo">Motivo</span>
            <select name="motivo" [ngModel]="motivo()" (ngModelChange)="motivo.set($event)">
              @for (opcion of motivos; track opcion.valor) {
                <option [value]="opcion.valor">{{ opcion.etiqueta }}</option>
              }
            </select>
          </label>

          <label class="campo">
            <span class="label-campo">Devolución que pedís (opcional)</span>
            <input
              name="monto"
              type="number"
              inputmode="decimal"
              min="0"
              [max]="o.tope"
              placeholder="0"
              [ngModel]="monto()"
              (ngModelChange)="monto.set($event)"
            />
            <span class="campo-ayuda num-tabular">Hasta $ {{ o.tope.toLocaleString('es-AR') }}</span>
          </label>

          <label class="campo">
            <span class="label-campo">Qué pasó</span>
            <textarea
              name="texto"
              rows="4"
              class="rounded-control border border-borde bg-papel px-3.5 py-3 text-[14px] text-tinta
                     placeholder:text-humo focus:border-acento focus:outline-none"
              [maxLength]="textoMax"
              placeholder="Contale al estacionamiento qué pasó."
              [ngModel]="texto()"
              (ngModelChange)="texto.set($event)"
            ></textarea>
            <span class="campo-ayuda num-tabular">{{ largo() }}/{{ textoMax }} · mínimo {{ textoMin }}</span>
          </label>

          @if (error(); as mensaje) {
            <p class="text-[13px] text-ocupada" role="alert">{{ mensaje }}</p>
          }

          <ui-boton tipo="submit" variante="primario" [bloque]="true" [cargando]="enviando()" [deshabilitado]="!valido(o)">
            Enviar reclamo
          </ui-boton>
        </form>
      }
    </ui-modal>
  `,
})
export class AbrirReclamo {
  private readonly incidencias = inject(IncidenciaService);

  /** null = cerrado. */
  readonly objeto = input<ObjetoReclamo | null>(null);
  readonly cerrado = output<void>();
  /** Se abrio el reclamo: su id, para ir a verlo. */
  readonly creado = output<Id>();

  protected readonly textoMin = TEXTO_MIN;
  protected readonly textoMax = TEXTO_MAX;
  protected readonly motivos = Object.entries(ETIQUETA_MOTIVO_RECLAMO).map(([valor, etiqueta]) => ({
    valor: valor as MotivoReclamo,
    etiqueta,
  }));

  protected readonly motivo = signal<MotivoReclamo>('NO_HABIA_LUGAR');
  protected readonly monto = signal<number | null>(null);
  protected readonly texto = signal('');
  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly largo = computed(() => this.texto().trim().length);

  protected valido(objeto: ObjetoReclamo): boolean {
    const monto = this.monto();
    const montoOk = monto === null || (monto >= 0 && monto <= objeto.tope);
    return montoOk && this.largo() >= TEXTO_MIN && this.largo() <= TEXTO_MAX;
  }

  protected enviar(objeto: ObjetoReclamo): void {
    if (!this.valido(objeto) || this.enviando()) return;
    this.enviando.set(true);
    this.error.set(null);
    const monto = this.monto();
    this.incidencias
      .reclamar({
        ...(objeto.tipo === 'reserva' ? { reservaId: objeto.id } : { abonoId: objeto.id }),
        motivo: this.motivo(),
        ...(monto !== null && monto > 0 ? { montoPedido: monto } : {}),
        texto: this.texto().trim(),
      })
      .subscribe({
        next: (incidencia) => {
          this.enviando.set(false);
          this.limpiar();
          this.creado.emit(incidencia.id);
        },
        error: (e: Error) => {
          this.enviando.set(false);
          this.error.set(e.message);
        },
      });
  }

  protected cerrar(): void {
    this.limpiar();
    this.cerrado.emit();
  }

  private limpiar(): void {
    this.motivo.set('NO_HABIA_LUGAR');
    this.monto.set(null);
    this.texto.set('');
    this.error.set(null);
  }
}
