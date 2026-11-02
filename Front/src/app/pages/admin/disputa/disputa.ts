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
  templateUrl: './disputa.html',
  styleUrl: './disputa.css',
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
