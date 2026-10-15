import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { Boton, Cargando, EstadoVacio, Modal, Tarjeta } from '@app/components/ui';
import { Id, PlanAbono, TURNOS } from '@app/models';
import { AbonoService } from '@app/services/abono.service';
import { EstacionamientoService } from '@app/services/estacionamiento.service';

/**
 * Pantalla `/conductor/abonos/estacionamiento/:estacionamientoId` · rol CONDUCTOR
 *
 * Los planes de abono de un estacionamiento. Comprar uno es pagar por
 * adelantado (simulado) sus usos; despues se reserva gratis en "Mis abonos".
 */
@Component({
  selector: 'app-planes-estacionamiento',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Boton, Cargando, EstadoVacio, Modal, Tarjeta, RouterLink],
  templateUrl: './planes-estacionamiento.html',
  styleUrl: './planes-estacionamiento.css',
})
export class PlanesEstacionamiento {
  private readonly abonos = inject(AbonoService);
  private readonly estacionamientos = inject(EstacionamientoService);
  private readonly router = inject(Router);

  readonly estacionamientoId = input.required<Id>();

  protected readonly turnos = TURNOS;
  protected readonly aComprar = signal<PlanAbono | null>(null);
  protected readonly comprandoId = signal<Id | null>(null);
  protected readonly error = signal<string | null>(null);

  protected readonly estacionamiento = rxResource({
    params: () => this.estacionamientoId(),
    stream: ({ params }) => this.estacionamientos.obtener(params),
  });

  protected readonly planes = rxResource({
    params: () => this.estacionamientoId(),
    stream: ({ params }) => this.abonos.planes(params),
    defaultValue: [] as PlanAbono[],
  });

  protected cerrarCompra(): void {
    if (this.comprandoId() !== null) return;
    this.aComprar.set(null);
    this.error.set(null);
  }

  protected comprar(plan: PlanAbono): void {
    this.comprandoId.set(plan.id);
    this.error.set(null);
    this.abonos.comprar(plan.id).subscribe({
      next: () => void this.router.navigate(['/conductor/abonos']),
      error: (e: Error) => {
        this.comprandoId.set(null);
        this.error.set(e.message);
      },
    });
  }
}
