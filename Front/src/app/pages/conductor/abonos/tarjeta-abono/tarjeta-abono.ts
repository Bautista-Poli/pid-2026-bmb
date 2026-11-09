import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Boton, Tarjeta } from '@app/components/ui';
import { Abono, TURNOS } from '@app/models';
import { abonoReclamable } from '@app/utils/reclamo.util';

/**
 * Un abono de Mis abonos (abonos.ts): estacionamiento, turno, vencimiento y
 * usos que le quedan. Si esta vigente, deja reservar con el o cancelarlo; si
 * corresponde, abrir un reclamo (o ver el que ya esta abierto).
 */
@Component({
  selector: 'app-tarjeta-abono',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, Boton, Tarjeta],
  templateUrl: './tarjeta-abono.html',
  styleUrl: './tarjeta-abono.css',
})
export class TarjetaAbono {
  readonly abono = input.required<Abono>();

  readonly cancelar = output<Abono>();
  /** "Tengo un problema": abre un reclamo sobre este abono. */
  readonly reclamar = output<Abono>();

  protected readonly turnos = TURNOS;
  protected readonly reclamable = computed(() => abonoReclamable(this.abono()));
}
