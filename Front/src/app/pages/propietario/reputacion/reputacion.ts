import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { DenunciarResena } from '@app/components/reclamo';
import { Boton, Cargando, EstadoVacio, Tarjeta } from '@app/components/ui';
import { CategoriasReputacion } from './categorias-reputacion/categorias-reputacion';
import { NivelesReputacion } from './niveles-reputacion/niveles-reputacion';
import { OperacionReputacion } from './operacion-reputacion/operacion-reputacion';
import { OpinionesReputacion } from './opiniones-reputacion/opiniones-reputacion';
import { PuntajeReputacion } from './puntaje-reputacion/puntaje-reputacion';
import { Estacionamiento, Id, PeriodoReputacion } from '@app/models';
import { AuthService } from '@app/services/auth.service';
import { CalificacionService } from '@app/services/calificacion.service';
import { EstacionamientoService } from '@app/services/estacionamiento.service';

const PERIODOS: { dias: PeriodoReputacion; etiqueta: string }[] = [
  { dias: 30, etiqueta: 'Últimos 30 días' },
  { dias: 90, etiqueta: 'Últimos 90 días' },
];

/**
 * Pantalla `/propietario/reputacion` · rol PROPIETARIO
 *
 * El puntaje de 0 a 100 de un estacionamiento: 60 por lo que califican los
 * conductores y 40 por como opera (lo mide Parkit). Desde 80, con suficientes
 * calificaciones, es "Anfitrion destacado": insignia dorada en la busqueda y el
 * mapa, y aparece primero. El estacionamiento y el periodo viven en la URL.
 */
@Component({
  selector: 'app-reputacion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PuntajeReputacion,
    CategoriasReputacion,
    NivelesReputacion,
    OperacionReputacion,
    OpinionesReputacion,
    Boton,
    Cargando,
    DenunciarResena,
    EstadoVacio,
    RouterLink,
    Tarjeta,
  ],
  templateUrl: './reputacion.html',
  styleUrls: ['./compartido.css', './reputacion.css'],
})
export class Reputacion {
  private readonly calificaciones = inject(CalificacionService);
  private readonly estacionamientos = inject(EstacionamientoService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);

  protected readonly periodos = PERIODOS;

  private readonly params = toSignal(this.ruta.queryParamMap, { requireSync: true });

  protected readonly dias = computed<PeriodoReputacion>(() => (this.params().get('dias') === '90' ? 90 : 30));

  protected readonly recursoEstacionamientos = rxResource({
    params: () => this.auth.usuario()?.id,
    stream: () => this.estacionamientos.listarDelPropietario().pipe(map((lista) => lista.filter((e) => e.activo))),
    defaultValue: [] as Estacionamiento[],
  });

  /** El de la URL o, si no vino, el primero. */
  protected readonly estacionamientoId = computed(
    () => this.params().get('estacionamiento') ?? this.recursoEstacionamientos.value()[0]?.id ?? null,
  );

  protected readonly nombre = computed(
    () => this.recursoEstacionamientos.value().find((e) => e.id === this.estacionamientoId())?.nombre ?? '',
  );

  protected readonly recurso = rxResource({
    params: () => {
      const id = this.estacionamientoId();
      return id ? { id, dias: this.dias() } : undefined;
    },
    stream: ({ params }) => this.calificaciones.reputacion(params.id, params.dias),
  });

  protected elegirPeriodo(dias: PeriodoReputacion): void {
    void this.router.navigate([], { queryParams: { dias }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  protected elegirEstacionamiento(evento: Event): void {
    const estacionamiento = (evento.target as HTMLSelectElement).value || null;
    void this.router.navigate([], { queryParams: { estacionamiento }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  /* --------------------------- denuncia de reseñas -------------------------- */

  /** Opinion que se esta denunciando: abre el modal. */
  protected readonly aDenunciar = signal<Id | null>(null);

  protected opinionDenunciada(): void {
    this.aDenunciar.set(null);
    this.recurso.reload();
  }
}
