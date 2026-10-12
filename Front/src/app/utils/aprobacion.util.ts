import { Estacionamiento, NuevoEstacionamiento } from '@app/models';

/**
 * Un aprobado al que le cambian el nombre o la direccion vuelve a la revision
 * del administrador (lo decide el backend; aca solo se avisa antes).
 */
export function vuelveARevision(actual: Estacionamiento, datos: NuevoEstacionamiento): boolean {
  if (actual.estadoAprobacion !== 'APROBADO') return false;
  const cambio = (antes: string, despues: string) => antes.trim() !== despues.trim();
  return (
    cambio(actual.nombre, datos.nombre) ||
    cambio(actual.direccion.calle, datos.direccion.calle) ||
    cambio(actual.direccion.numero, datos.direccion.numero) ||
    cambio(actual.direccion.ciudad, datos.direccion.ciudad) ||
    cambio(actual.direccion.provincia, datos.direccion.provincia)
  );
}
