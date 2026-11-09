import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Boton, Tarjeta } from '@app/components/ui';
import { IncidenciaModerada, ResolucionIncidencia } from '@app/models';
import { AdminService } from '@app/services/admin/admin.service';
import { pesos } from '../formato';

const FUNDAMENTO_MIN = 20;
const FUNDAMENTO_MAX = 1000;

/**
 * Formulario para resolver una disputa denunciada (disputa.ts): a favor de quien,
 * cuanto se devuelve (si es a favor del conductor, hasta el tope) y el
 * fundamento que leen las dos partes. Al resolver vuelve a la lista de disputas.
 */
@Component({
  selector: 'app-resolver-disputa',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Boton, Tarjeta],
  templateUrl: './resolver-disputa.html',
  styleUrls: ['../compartido.css', './resolver-disputa.css'],
  host: { style: 'display: contents' },
})
export class ResolverDisputa {
  private readonly admin = inject(AdminService);
  private readonly router = inject(Router);

  readonly d = input.required<IncidenciaModerada>();

  protected readonly fundamentoMin = FUNDAMENTO_MIN;
  protected readonly fundamentoMax = FUNDAMENTO_MAX;
  protected readonly pesos = pesos;

  protected readonly resolucion = signal<ResolucionIncidencia | null>(null);
  protected readonly monto = signal<number | null>(null);
  protected readonly fundamento = signal('');
  protected readonly resolviendo = signal(false);
  protected readonly error = signal<string | null>(null);

  protected leer(evento: Event): string {
    return (evento.target as HTMLTextAreaElement).value;
  }

  protected leerMonto(evento: Event): void {
    const valor = (evento.target as HTMLInputElement).value;
    this.monto.set(valor === '' ? null : Number(valor));
  }

  /** Si se puede resolver: fundamento con largo valido y, a favor del conductor, un monto dentro del tope. */
  protected resolucionValida(): boolean {
    const largo = this.fundamento().trim().length;
    if (largo < FUNDAMENTO_MIN || largo > FUNDAMENTO_MAX) return false;
    if (this.resolucion() === 'A_FAVOR_PROPIETARIO') return true;
    const monto = this.monto();
    return this.resolucion() === 'A_FAVOR_CONDUCTOR' && monto !== null && monto > 0 && monto <= this.d().tope;
  }

  /** Resuelve la disputa (con devolucion si es a favor del conductor). */
  protected resolver(): void {
    const resolucion = this.resolucion();
    if (!resolucion || !this.resolucionValida() || this.resolviendo()) return;
    this.resolviendo.set(true);
    this.error.set(null);
    this.admin
      .resolverIncidencia(this.d().id, {
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
