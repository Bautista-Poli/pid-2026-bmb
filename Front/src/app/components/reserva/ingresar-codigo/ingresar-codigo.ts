import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Boton } from '@app/components/ui';
import { normalizarCodigo } from '@app/utils/codigo-acceso.util';

/** Para cuando la camara no lee el QR: el operador tipea el codigo de la reserva. */
@Component({
  selector: 'app-ingresar-codigo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Boton],
  template: `
    @if (!abierto()) {
      <ui-boton tamano="sm" (presionado)="abierto.set(true)">Ingresar código</ui-boton>
    } @else {
      <form class="flex flex-wrap items-start gap-2" (submit)="$event.preventDefault(); ir(campo.value)">
        <label class="sr-only" for="codigo-reserva">Código de la reserva</label>
        <input
          #campo
          id="codigo-reserva"
          class="h-10 w-40 rounded-boton border border-borde bg-papel px-3 text-[15px] uppercase tracking-[0.12em]"
          placeholder="K7MQ-2XTR"
          autocomplete="off"
          autocapitalize="characters"
          maxlength="10"
        />
        <ui-boton tipo="submit" variante="primario" tamano="sm">Buscar</ui-boton>
        <ui-boton tamano="sm" (presionado)="abierto.set(false)">Cancelar</ui-boton>
        @if (error(); as mensaje) {
          <p class="w-full text-[12.5px] text-ocupada" role="alert">{{ mensaje }}</p>
        }
      </form>
    }
  `,
})
export class IngresarCodigo {
  private readonly router = inject(Router);

  protected readonly abierto = signal(false);
  protected readonly error = signal<string | null>(null);

  protected ir(bruto: string): void {
    const codigo = normalizarCodigo(bruto);
    if (!codigo) {
      this.error.set('El código tiene 8 caracteres, como K7MQ-2XTR');
      return;
    }
    this.error.set(null);
    void this.router.navigate(['/propietario/acceso', codigo]);
  }
}
