import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { Abono, Id, NuevoPlanAbono, PlanAbono } from '@app/models';
import { AbonoDto, PlanAbonoDto } from './api/api.dto';
import { aAbono, aPlanAbono } from './api/api.mapeo';

/** Planes de abono (propietario) y abonos comprados (conductor). */
@Injectable({ providedIn: 'root' })
export class AbonoService {
  private readonly http = inject(HttpClient);

  private rutaPlanes(estacionamientoId: Id): string {
    return `/estacionamientos/${estacionamientoId}/planes-abono`;
  }

  /** `GET /api/estacionamientos/:id/planes-abono` (publico) */
  planes(estacionamientoId: Id): Observable<PlanAbono[]> {
    return this.http
      .get<{ planes: PlanAbonoDto[] }>(this.rutaPlanes(estacionamientoId))
      .pipe(map(({ planes }) => planes.map(aPlanAbono)));
  }

  crearPlan(estacionamientoId: Id, datos: NuevoPlanAbono): Observable<PlanAbono> {
    return this.http
      .post<{ plan: PlanAbonoDto }>(this.rutaPlanes(estacionamientoId), datos)
      .pipe(map(({ plan }) => aPlanAbono(plan)));
  }

  actualizarPlan(estacionamientoId: Id, planId: Id, cambios: Partial<Pick<NuevoPlanAbono, 'cupos' | 'precio'>>): Observable<PlanAbono> {
    return this.http
      .patch<{ plan: PlanAbonoDto }>(`${this.rutaPlanes(estacionamientoId)}/${planId}`, cambios)
      .pipe(map(({ plan }) => aPlanAbono(plan)));
  }

  darDeBajaPlan(estacionamientoId: Id, planId: Id): Observable<void> {
    return this.http.delete<void>(`${this.rutaPlanes(estacionamientoId)}/${planId}`);
  }

  /** `POST /api/abonos`: el pago es simulado. */
  comprar(planId: Id): Observable<Abono> {
    return this.http.post<{ abono: AbonoDto }>('/abonos', { id_plan: planId }).pipe(map(({ abono }) => aAbono(abono)));
  }

  misAbonos(): Observable<Abono[]> {
    return this.http.get<{ abonos: AbonoDto[] }>('/abonos').pipe(map(({ abonos }) => abonos.map(aAbono)));
  }

  cancelar(abonoId: Id): Observable<Abono> {
    return this.http
      .patch<{ abono: AbonoDto }>(`/abonos/${abonoId}/cancelar`, {})
      .pipe(map(({ abono }) => aAbono(abono)));
  }

  /** `GET /api/estacionamientos/:id/abonos` (propietario) */
  vendidos(estacionamientoId: Id): Observable<Abono[]> {
    return this.http
      .get<{ abonos: AbonoDto[] }>(`/estacionamientos/${estacionamientoId}/abonos`)
      .pipe(map(({ abonos }) => abonos.map(aAbono)));
  }
}
