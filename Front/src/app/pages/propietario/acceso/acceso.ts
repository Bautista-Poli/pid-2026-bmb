import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Boton, Cargando, EstadoVacio, Tarjeta } from '@app/components/ui';
import { AccesoReserva } from '@app/models';
import { ReservaService } from '@app/services/reserva.service';
import { formatearCodigo, normalizarCodigo } from '@app/utils/codigo-acceso.util';

const TEXTO_ACCION = { INGRESO: 'Registrar ingreso', EGRESO: 'Registrar egreso' } as const;

/**
 * Pantalla `/propietario/acceso/:codigo` · rol PROPIETARIO (operador)
 *
 * Adonde lleva el QR de una reserva. Muestra que se va a registrar (ingreso o
 * egreso, segun su estado) y espera la confirmacion: un escaneo accidental no
 * registra nada.
 */
@Component({
  selector: 'app-acceso',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Boton, Cargando, EstadoVacio, Tarjeta, RouterLink, DatePipe],
  templateUrl: './acceso.html',
})
export class Acceso {
  private readonly reservas = inject(ReservaService);

  /** Llega del parametro de ruta `:codigo`, tal cual lo escaneo o tipeo el operador. */
  readonly codigo = input.required<string>();

  protected readonly textoAccion = TEXTO_ACCION;

  protected readonly codigoNormalizado = computed(() => normalizarCodigo(this.codigo()));
  protected readonly codigoVisible = computed(() => {
    const codigo = this.codigoNormalizado();
    return codigo ? formatearCodigo(codigo) : this.codigo();
  });

  protected readonly previa = rxResource({
    params: () => this.codigoNormalizado() ?? undefined,
    stream: ({ params }) => this.reservas.previaAcceso(params),
  });

  protected readonly registrando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly resultado = signal<AccesoReserva | null>(null);

  protected registrar(): void {
    const codigo = this.codigoNormalizado();
    if (!codigo) return;

    this.registrando.set(true);
    this.error.set(null);
    this.reservas.registrarAcceso(codigo).subscribe({
      next: (resultado) => {
        this.registrando.set(false);
        this.resultado.set(resultado);
      },
      error: (e: Error) => {
        this.registrando.set(false);
        this.error.set(e.message);
      },
    });
  }
}
