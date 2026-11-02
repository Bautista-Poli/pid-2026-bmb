import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Reputacion as ReputacionModelo } from '@app/models';
import { textoReputacion } from '@app/utils/calificacion.util';

/** `4.6★ (37)`, o "Nuevo" / "Sin calificaciones" si todavia no tiene. */
@Component({
  selector: 'app-reputacion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex items-center gap-1 text-[12.5px] num-tabular' },
  template: `
    <span [class.text-acento]="tiene()" [class.text-humo]="!tiene()" aria-hidden="true">★</span>
    <span [class.text-tinta]="tiene()" [class.text-grafito]="!tiene()">{{ texto() }}</span>
  `,
})
export class Reputacion {
  readonly reputacion = input.required<ReputacionModelo>();
  readonly sinDatos = input<'Nuevo' | 'Sin calificaciones'>('Nuevo');

  protected readonly tiene = computed(() => this.reputacion().cantidad > 0);
  protected readonly texto = computed(() =>
    textoReputacion(this.reputacion(), this.sinDatos()).replace('★', ''),
  );
}
