import { Estacionamiento, NuevoEstacionamiento } from '@app/models';
import { vuelveARevision } from './aprobacion.util';

const direccion = {
  calle: 'Av. Belgrano',
  numero: '1240',
  ciudad: 'CABA',
  provincia: 'Buenos Aires',
  codigoPostal: '',
  latitud: null,
  longitud: null,
};

const actual = { nombre: 'Cochera Centro', direccion, estadoAprobacion: 'APROBADO' } as Estacionamiento;

const formulario = (cambios: Partial<NuevoEstacionamiento> = {}): NuevoEstacionamiento => ({
  nombre: 'Cochera Centro',
  direccion,
  tarifas: { hora: 1000, estadia: null, jornada: null },
  publicado: true,
  horarios: [],
  ...cambios,
});

describe('vuelveARevision', () => {
  it('avisa si cambia el nombre de uno aprobado', () => {
    expect(vuelveARevision(actual, formulario({ nombre: 'Cochera Norte' }))).toBe(true);
  });

  it('avisa si cambia la altura de la direccion', () => {
    expect(vuelveARevision(actual, formulario({ direccion: { ...direccion, numero: '1300' } }))).toBe(true);
  });

  it('no avisa si solo cambian otros datos o espacios de mas', () => {
    expect(
      vuelveARevision(actual, formulario({ nombre: ' Cochera Centro ', tarifas: { hora: 2000, estadia: null, jornada: null } })),
    ).toBe(false);
  });

  it('no avisa si todavia no estaba aprobado', () => {
    const pendiente = { ...actual, estadoAprobacion: 'PENDIENTE' } as Estacionamiento;
    expect(vuelveARevision(pendiente, formulario({ nombre: 'Cochera Norte' }))).toBe(false);
  });
});
