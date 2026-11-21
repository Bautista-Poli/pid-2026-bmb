import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Boton, Cargando, EstadoVacio, Modal } from '@app/components/ui';
import { Abono } from '@app/models';
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
  imports: [TarjetaAbono, Boton, Cargando, EstadoVacio, Modal, RouterLink],
  templateUrl: './abonos.html',
  styleUrl: './abonos.css',
})
export class Abonos {
  private readonly abonos = inject(AbonoService);

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
