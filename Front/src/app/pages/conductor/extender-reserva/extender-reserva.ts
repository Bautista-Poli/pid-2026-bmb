import { Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Id, ReservaDetallada } from '@app/models';
import { ReservaService } from '@app/services';
import { aInstante } from '@app/utils/fecha.util';
import { diaSemanaDe, hoyISO } from '@app/utils/fecha.util';

import { reservaEnJuego } from '@app/services/ciclo-reserva';
import { TarjetaReserva } from '../mis-reservas/tarjeta-reserva/tarjeta-reserva';
import { SelectorFecha } from '../reservar/selector-fecha/selector-fecha';
const inicioDe = (reserva: ReservaDetallada) =>
  Date.parse(aInstante(reserva.fecha, reserva.horaDesde));

@Component({
  selector: 'app-extender-reserva',
  imports: [
    TarjetaReserva,
    SelectorFecha
  ],
  templateUrl: './extender-reserva.html',
  styleUrl: './extender-reserva.css',
})
export class ExtenderReserva {
  private readonly reservas = inject(ReservaService);

  protected readonly borrador = this.reservas.borrador;
  protected readonly recurso = rxResource({
    stream: () => this.reservas.listarMisReservas(),
    defaultValue: [] as ReservaDetallada[],
  });
  protected elegirFecha(fecha: string | null): void {
    this.reservas.actualizarBorrador({ fecha });
  }
  protected extender(id: string ): void {
      this.reservas.extender(id).subscribe({});
      //this.reservas.extender(id,fechaAExtender,).subscribe({});
      
  }

  private readonly vigentes = computed(() =>
    this.recurso
      .value()
      .filter(reservaEnJuego)
      .sort((a, b) => inicioDe(a) - inicioDe(b)),
  );
  protected readonly enCurso = computed(() =>
    this.vigentes().filter((reserva) => reserva.estado === 'ACTIVA'),
  );

  private readonly pasadas = computed(() =>
    this.recurso
      .value()
      .filter((reserva) => !reservaEnJuego(reserva))
      .sort((a, b) => inicioDe(b) - inicioDe(a)),
  );

  /** La mas reciente que todavia puede calificar (entro y salio hace menos de 7 dias). */
  protected readonly porCalificar = computed(() => this.pasadas().find((reserva) => reserva.calificable) ?? null);

  protected readonly cantidadVigentes = computed(() => this.vigentes().length);

  

}
