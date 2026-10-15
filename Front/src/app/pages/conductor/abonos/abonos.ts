import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AbrirReclamo, ObjetoReclamo } from '@app/components/reclamo';
import { Boton, Cargando, EstadoVacio, Modal, Tarjeta } from '@app/components/ui';
import { Abono, Id, TURNOS } from '@app/models';
import { AbonoService } from '@app/services/abono.service';
import { abonoReclamable } from '@app/utils/reclamo.util';

/**
 * Pantalla `/conductor/abonos` · rol CONDUCTOR
 *
 * Los abonos comprados con sus usos restantes. Desde aca se reserva con uno
 * (gratis, dentro de su turno) o se lo cancela.
 */
@Component({
  selector: 'app-abonos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AbrirReclamo, Boton, Cargando, EstadoVacio, Modal, Tarjeta, RouterLink, DatePipe],
  templateUrl: './abonos.html',
  styleUrl: './abonos.css',
})
export class Abonos {
  private readonly abonos = inject(AbonoService);
  private readonly router = inject(Router);

  protected readonly reclamable = (abono: Abono) => abonoReclamable(abono);
  /** Abono sobre el que el conductor abre un reclamo: mientras no sea null, el modal esta abierto. */
  protected readonly aReclamar = signal<ObjetoReclamo | null>(null);

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

  protected readonly turnos = TURNOS;
  protected readonly aCancelar = signal<Abono | null>(null);
  protected readonly cancelando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly recurso = rxResource({
    stream: () => this.abonos.misAbonos(),
    defaultValue: [] as Abono[],
  });

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
