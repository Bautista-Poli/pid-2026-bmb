import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { GaleriaFotos, MapaEstacionamientos } from '@app/components/estacionamiento';
import { Boton, Cargando, EstadoVacio, Etiqueta, Modal, Tarjeta, TonoEtiqueta } from '@app/components/ui';
import { EstacionamientoEnRevision, EstadoAprobacion } from '@app/models';
import { AdminService } from '@app/services/admin.service';

const MOTIVO_MIN = 10;
const MOTIVO_MAX = 300;

const ETIQUETA_ESTADO: Record<EstadoAprobacion, string> = {
  PENDIENTE: 'Pendiente',
  APROBADO: 'Aprobado',
  RECHAZADO: 'Rechazado',
};

const TONO_ESTADO: Record<EstadoAprobacion, TonoEtiqueta> = {
  PENDIENTE: 'aviso',
  APROBADO: 'exito',
  RECHAZADO: 'peligro',
};

const pesos = (monto: number | null) => (monto === null ? null : `$ ${monto.toLocaleString('es-AR')}`);

/**
 * Pantalla `/admin/estacionamientos/:estacionamientoId` · rol ADMINISTRADOR
 *
 * Todo lo que hace falta para decidir: fotos, ubicacion, horarios, tarifas,
 * cocheras y el propietario. Si esta pendiente, se aprueba o se rechaza con un
 * motivo que despues ve el propietario.
 */
@Component({
  selector: 'app-revision-estacionamiento',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    Boton,
    Cargando,
    DatePipe,
    Etiqueta,
    EstadoVacio,
    FormsModule,
    GaleriaFotos,
    MapaEstacionamientos,
    Modal,
    RouterLink,
    Tarjeta,
  ],
  templateUrl: './revision-estacionamiento.html',
  styleUrl: './revision-estacionamiento.css',
})
export class RevisionEstacionamiento {
  private readonly admin = inject(AdminService);
  private readonly router = inject(Router);

  /** Parametro de ruta (withComponentInputBinding). */
  readonly estacionamientoId = input.required<string>();

  protected readonly motivoMin = MOTIVO_MIN;
  protected readonly motivoMax = MOTIVO_MAX;
  protected readonly etiquetaEstado = ETIQUETA_ESTADO;
  protected readonly tonoEstado = TONO_ESTADO;

  protected readonly aprobando = signal(false);
  protected readonly rechazando = signal(false);
  protected readonly motivo = signal('');
  protected readonly guardando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly recurso = rxResource({
    params: () => this.estacionamientoId(),
    stream: ({ params }) => this.admin.obtenerEstacionamiento(params),
  });

  protected readonly tarifas = computed(() => {
    const tarifas = this.recurso.value()?.tarifas;
    if (!tarifas) return [];
    return [
      { etiqueta: 'Por hora', valor: pesos(tarifas.hora) },
      { etiqueta: 'Estadía (12 h)', valor: pesos(tarifas.estadia) },
      { etiqueta: 'Jornada (24 h)', valor: pesos(tarifas.jornada) },
    ];
  });

  protected abrirAprobacion(): void {
    this.error.set(null);
    this.aprobando.set(true);
  }

  protected abrirRechazo(): void {
    this.motivo.set('');
    this.error.set(null);
    this.rechazando.set(true);
  }

  protected aprobar(estacionamiento: EstacionamientoEnRevision): void {
    this.decidir(this.admin.aprobar(estacionamiento.id, estacionamiento.enviadoEn));
  }

  protected rechazar(estacionamiento: EstacionamientoEnRevision): void {
    this.decidir(this.admin.rechazar(estacionamiento.id, this.motivo().trim(), estacionamiento.enviadoEn));
  }

  /** Aprobar o rechazar: al terminar vuelve a la cola, que ya no lo muestra. */
  private decidir(pedido: Observable<EstacionamientoEnRevision>): void {
    this.guardando.set(true);
    this.error.set(null);
    pedido.subscribe({
      next: () => {
        this.guardando.set(false);
        void this.router.navigate(['/admin/pendientes']);
      },
      error: (e: Error) => {
        this.guardando.set(false);
        this.error.set(e.message);
      },
    });
  }
}
