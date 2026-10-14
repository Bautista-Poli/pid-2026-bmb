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
  template: `
    <div class="aparece mx-auto w-full max-w-[640px] px-6 pt-5 pb-8 lg:px-10 lg:pt-[34px] lg:pb-11">
      <div class="flex flex-col gap-6">
        <header>
          <p class="eyebrow">Conductor</p>
          <h1 class="titulo-vista mt-1.5">Mis abonos</h1>
        </header>

        @if (recurso.status() === 'loading') {
          <ui-cargando [cantidad]="2" />
        } @else if (recurso.error(); as e) {
          <ui-estado-vacio titulo="No pudimos cargar tus abonos" [descripcion]="e.message">
            <ui-boton (presionado)="recurso.reload()">Reintentar</ui-boton>
          </ui-estado-vacio>
        } @else if (recurso.value().length === 0) {
          <ui-estado-vacio
            titulo="Todavía no tenés abonos"
            descripcion="Buscá un estacionamiento en el mapa y abrí “Ver abonos mensuales”."
          >
            <ui-boton routerLink="/conductor/explorar">Explorar estacionamientos</ui-boton>
          </ui-estado-vacio>
        } @else {
          @for (abono of recurso.value(); track abono.id) {
            <ui-tarjeta>
              <div class="flex flex-col gap-3">
                <div>
                  <p class="text-[15px] font-semibold text-tinta">{{ abono.estacionamiento }}</p>
                  <p class="mt-1 text-[13px] text-plomo">
                    Turno {{ turnos[abono.turno].etiqueta.toLowerCase() }}
                    ({{ turnos[abono.turno].desde }} a {{ turnos[abono.turno].hasta }}) ·
                    vence el {{ abono.hasta | date: 'd MMM' }}
                  </p>
                  <p class="mt-1 text-[13px] text-tinta">
                    {{ abono.cuposRestantes }} de {{ abono.cuposTotales }} usos disponibles
                    @if (abono.estado !== 'VIGENTE') {
                      <span class="text-plomo">· {{ abono.estado.toLowerCase() }}</span>
                    }
                  </p>
                  @if (abono.devuelto > 0) {
                    <p class="num-tabular mt-1 text-[12.5px] font-semibold text-exito">
                      Devuelto $ {{ abono.devuelto.toLocaleString('es-AR') }}
                    </p>
                  }
                </div>
                @if (abono.estado === 'VIGENTE') {
                  <div class="flex flex-wrap gap-2">
                    @if (abono.cuposRestantes > 0) {
                      <ui-boton
                        variante="primario"
                        tamano="sm"
                        [routerLink]="['/conductor/abonos', abono.id, 'reservar']"
                      >
                        Reservar con este abono
                      </ui-boton>
                    } @else {
                      <ui-boton variante="primario" tamano="sm" [deshabilitado]="true">
                        Sin usos disponibles
                      </ui-boton>
                    }
                    <ui-boton variante="peligro" tamano="sm" (presionado)="aCancelar.set(abono)">
                      Cancelar abono
                    </ui-boton>
                  </div>
                }
                @if (abono.reclamoAbierto; as id) {
                  <div>
                    <ui-boton variante="secundario" tamano="sm" routerLink="/conductor/incidencias" [queryParams]="{ id }">
                      Ver reclamo
                    </ui-boton>
                  </div>
                } @else if (reclamable(abono)) {
                  <div>
                    <ui-boton variante="secundario" tamano="sm" (presionado)="pedirReclamo(abono)">
                      Tengo un problema
                    </ui-boton>
                  </div>
                }
              </div>
            </ui-tarjeta>
          }
        }
      </div>
    </div>

    <ui-modal titulo="Cancelar abono" [abierto]="aCancelar() !== null" (cerrado)="aCancelar.set(null)">
      @if (aCancelar(); as abono) {
        <div class="flex flex-col gap-4">
          <p class="text-[13.5px] text-grafito">
            Se cancelan también tus reservas con este abono que todavía no empezaron. El pago no se
            devuelve.
          </p>
          @if (error(); as mensaje) {
            <p class="text-[13px] text-ocupada" role="alert">{{ mensaje }}</p>
          }
          <ui-boton variante="peligro" [bloque]="true" [cargando]="cancelando()" (presionado)="cancelar(abono)">
            Cancelar abono
          </ui-boton>
        </div>
      }
    </ui-modal>

    <app-abrir-reclamo [objeto]="aReclamar()" (cerrado)="aReclamar.set(null)" (creado)="verReclamo($event)" />
  `,
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
