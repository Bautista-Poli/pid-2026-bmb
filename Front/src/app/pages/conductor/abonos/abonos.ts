import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { AbrirReclamo, ObjetoReclamo } from '@app/components/reclamo';
import { Boton, Cargando, EstadoVacio, Modal } from '@app/components/ui';
import { Abono, Id } from '@app/models';
import { AbonoService } from '@app/services/abono.service';
import { TarjetaAbono } from './tarjeta-abono/tarjeta-abono';

/**
 * Pantalla `/conductor/abonos` · rol CONDUCTOR
 *
 * Los abonos comprados con sus usos restantes. Desde aca se reserva con uno
 * (gratis, dentro de su turno) o se lo cancela.
 */
@Component({
  selector: 'app-abonos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TarjetaAbono, AbrirReclamo, Boton, Cargando, EstadoVacio, Modal, RouterLink],
  templateUrl: './abonos.html',
  styleUrl: './abonos.css',
})
export class Abonos {
  private readonly abonos = inject(AbonoService);
  private readonly router = inject(Router);

  /** Abono sobre el que el conductor abre un reclamo: mientras no sea null, el modal esta abierto. */
  protected readonly aReclamar = signal<ObjetoReclamo | null>(null);

  /** Abre el modal de reclamo sobre un abono (tope: lo pagado menos lo devuelto). */
  protected pedirReclamo(abono: Abono): void {
    this.aReclamar.set({
      tipo: 'abono',
      id: abono.id,
      descripcion: `Abono en ${abono.estacionamiento}`,
      tope: Math.max(0, abono.precioTotal - abono.devuelto),
    });
  }

  protected verReclamo(id: Id): void {
    this.aReclamar.set(null);
    this.router.navigate(['/conductor/incidencias'], { queryParams: { id } });
  }

  protected readonly aCancelar = signal<Abono | null>(null);
  protected readonly cancelando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly recurso = rxResource({
    stream: () => this.abonos.misAbonos(),
    defaultValue: [] as Abono[],
  });

  /** Cancela el abono y recarga la lista. */
  protected cancelar(abono: Abono): void {
    this.cancelando.set(true);
    this.error.set(null);
    this.abonos.cancelar(abono.id).subscribe({
      next: () => {
        this.cancelando.set(false);
        this.aCancelar.set(null);
        this.recurso.reload();
      },
      error: (e: Error) => {
        this.cancelando.set(false);
        this.error.set(e.message);
      },
    });
  }
}
