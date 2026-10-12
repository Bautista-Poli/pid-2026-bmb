import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Una celda con datos; las que no vienen valen 0. `diaSemana`: 0 = domingo. */
export interface CeldaDemanda {
  diaSemana: number;
  hora: number;
  reservas: number;
}

/** Lunes primero, como se lee una semana de trabajo. */
const DIAS = [
  { numero: 1, etiqueta: 'Lun' },
  { numero: 2, etiqueta: 'Mar' },
  { numero: 3, etiqueta: 'Mié' },
  { numero: 4, etiqueta: 'Jue' },
  { numero: 5, etiqueta: 'Vie' },
  { numero: 6, etiqueta: 'Sáb' },
  { numero: 0, etiqueta: 'Dom' },
];
const HORAS = Array.from({ length: 24 }, (_, hora) => hora);

/**
 * Demanda por dia de la semana y hora: 7 filas x 24 columnas, la intensidad es
 * la opacidad del color de acento sobre el maximo. En pantallas chicas se
 * desplaza en horizontal.
 */
@Component({
  selector: 'app-mapa-calor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="overflow-x-auto pb-1">
      <table
        class="w-full min-w-[560px] table-fixed border-separate border-spacing-[3px]"
        aria-label="Reservas por día y hora"
      >
        <thead>
          <tr>
            <th class="w-9"><span class="sr-only">Día</span></th>
            @for (hora of horas; track hora) {
              <th class="num-tabular text-[10px] font-normal text-humo" scope="col">
                <span aria-hidden="true">{{ hora % 3 === 0 ? hora : '' }}</span>
                <span class="sr-only">{{ hora }}:00</span>
              </th>
            }
          </tr>
        </thead>
        <tbody>
          @for (dia of dias; track dia.numero) {
            <tr>
              <th class="pr-1 text-left text-[11px] font-medium text-plomo" scope="row">{{ dia.etiqueta }}</th>
              @for (hora of horas; track hora) {
                @let cantidad = valor(dia.numero, hora);
                <td
                  class="h-6 rounded-[3px] bg-borde-sutil"
                  [style.background-color]="cantidad > 0 ? color(cantidad) : null"
                  [attr.title]="dia.etiqueta + ' ' + hora + ':00 · ' + cantidad + (cantidad === 1 ? ' reserva' : ' reservas')"
                >
                  <span class="sr-only">{{ cantidad }}</span>
                </td>
              }
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
  host: { class: 'block' },
})
export class MapaCalor {
  readonly celdas = input.required<CeldaDemanda[]>();

  protected readonly dias = DIAS;
  protected readonly horas = HORAS;

  private readonly indice = computed(() => {
    const mapa = new Map<string, number>();
    for (const c of this.celdas()) mapa.set(`${c.diaSemana}-${c.hora}`, c.reservas);
    return mapa;
  });

  private readonly maximo = computed(() => Math.max(1, ...this.celdas().map((c) => c.reservas)));

  protected valor(dia: number, hora: number): number {
    return this.indice().get(`${dia}-${hora}`) ?? 0;
  }

  /** De 20 % a 100 % de opacidad del acento, para que hasta 1 reserva se vea. */
  protected color(cantidad: number): string {
    const intensidad = 20 + Math.round((cantidad / this.maximo()) * 80);
    return `color-mix(in srgb, var(--color-acento) ${intensidad}%, transparent)`;
  }
}
