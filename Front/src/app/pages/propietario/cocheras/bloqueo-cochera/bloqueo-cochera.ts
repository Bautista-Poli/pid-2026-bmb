import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Boton, Modal } from '@app/components/ui';
import { ErrorApi } from '@app/interceptors/error.interceptor';
import { Cochera } from '@app/models';
import { CocheraService } from '@app/services/propietario/cochera.service';

/**
 * Modal de Cocheras (cocheras.ts) para bloquear una cochera por mantenimiento,
 * con motivo y fecha de fin opcionales. Bloquea y avisa con `bloqueada` el
 * mensaje para la pantalla.
 *
 * Sin `forzar`: si alguna reserva de la cochera no tiene otra cochera
 * compatible para reasignar, el backend responde 409 (todo o nada, no se
 * bloquea nada) y se ofrece "bloquear igual" (`forzar: true`), que cancela
 * esas puntuales en vez de trabar el bloqueo.
 */
@Component({
  selector: 'app-bloqueo-cochera',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, Boton, Modal],
  templateUrl: './bloqueo-cochera.html',
  styleUrls: ['../compartido.css', './bloqueo-cochera.css'],
})
export class BloqueoCochera {
  private readonly fb = inject(FormBuilder);
  private readonly cocheras = inject(CocheraService);

  /** Mientras no sea null, el modal esta abierto. */
  readonly cochera = input<Cochera | null>(null);

  readonly cerrado = output<void>();
  readonly bloqueada = output<string>();

  protected readonly enviando = signal(false);
  /** Se prendio con el 409 de "sin alternativa": habilita el boton de bloquear igual. */
  protected readonly necesitaForzar = signal(false);
  protected readonly errorBloqueo = signal<string | null>(null);

  protected readonly formularioBloqueo = this.fb.nonNullable.group({
    motivo: ['', [Validators.maxLength(300)]],
    hasta: [''],
  });

  /** Cada cochera arranca con el formulario vacio. */
  private readonly alAbrir = effect(() => {
    this.cochera();
    this.necesitaForzar.set(false);
    this.errorBloqueo.set(null);
    this.formularioBloqueo.reset({ motivo: '', hasta: '' });
  });

  protected cerrarBloqueo(): void {
    this.cerrado.emit();
  }

  protected confirmarBloqueo(forzar: boolean): void {
    const cochera = this.cochera();
    if (!cochera) return;

    const { motivo, hasta } = this.formularioBloqueo.getRawValue();
    this.enviando.set(true);
    this.errorBloqueo.set(null);

    this.cocheras
      .bloquear(cochera, {
        motivo: motivo.trim() || undefined,
        hasta: hasta ? new Date(hasta).toISOString() : null,
        forzar,
      })
      .subscribe({
        next: ({ reasignadas, canceladas }) => {
          this.enviando.set(false);
          const partes = [
            reasignadas > 0 ? `reasignamos ${reasignadas} reserva(s)` : null,
            canceladas > 0 ? `cancelamos ${canceladas} reserva(s) sin alternativa` : null,
          ].filter(Boolean);
          this.bloqueada.emit(
            `La cochera ${cochera.identificador} quedó bloqueada` +
              (partes.length ? `: ${partes.join(' y ')}.` : '.'),
          );
        },
        error: (e: Error) => {
          this.enviando.set(false);
          this.errorBloqueo.set(e.message);
          // cochera.service.js: bloquear() lista en `details` las que no tienen alternativa.
          const detalles = e instanceof ErrorApi ? e.detalles : null;
          this.necesitaForzar.set(
            typeof detalles === 'object' && detalles !== null && 'reservas_sin_alternativa' in detalles,
          );
        },
      });
  }
}
