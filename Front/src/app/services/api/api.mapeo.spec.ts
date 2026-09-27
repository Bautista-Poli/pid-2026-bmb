import { NuevaReserva, NuevoEstacionamiento } from '@app/models';
import { aPayloadEstacionamiento, aPayloadReserva } from './api.mapeo';

const BASE: NuevoEstacionamiento = {
  nombre: 'Cochera Centro',
  direccion: {
    calle: 'Av. Belgrano',
    numero: '1240',
    ciudad: 'CABA',
    provincia: 'Buenos Aires',
    codigoPostal: '',
    latitud: null,
    longitud: null,
  },
  tarifas: { hora: null, estadia: 5000, jornada: null },
  publicado: true,
  horarios: [],
};

describe('aPayloadEstacionamiento', () => {
  it('manda null en las tarifas que no se ofrecen, nunca 0', () => {
    const payload = aPayloadEstacionamiento(BASE);

    expect(payload.tarifa_hora).toBeNull();
    expect(payload.tarifa_estadia).toBe(5000);
    expect(payload.tarifa_jornada).toBeNull();
  });
});

describe('aPayloadReserva', () => {
  const base = {
    estacionamientoId: 'e1',
    vehiculoId: 'v1',
    fecha: '2026-09-14',
    horaDesde: '08:00',
  };
  const horas = (payload: { inicio: string; fin: string }) =>
    (Date.parse(payload.fin) - Date.parse(payload.inicio)) / 3_600_000;

  it('por hora usa la hora de fin elegida', () => {
    const payload = aPayloadReserva({ ...base, modalidad: 'HORA', horaHasta: '10:00' } as NuevaReserva);

    expect(payload.modalidad).toBe('HORA');
    expect(payload.inicio).toBe('2026-09-14T08:00:00-03:00');
    expect(payload.fin).toBe('2026-09-14T10:00:00-03:00');
  });

  it('la estadia termina 12 horas despues, aunque cruce la medianoche', () => {
    const payload = aPayloadReserva({
      ...base,
      horaDesde: '18:00',
      modalidad: 'ESTADIA',
      horaHasta: null,
    } as NuevaReserva);

    expect(payload.modalidad).toBe('ESTADIA');
    expect(payload.fin).toBe('2026-09-15T09:00:00.000Z');
    expect(horas(payload)).toBe(12);
  });

  it('la jornada termina 24 horas despues', () => {
    const payload = aPayloadReserva({ ...base, modalidad: 'JORNADA', horaHasta: null } as NuevaReserva);

    expect(payload.modalidad).toBe('JORNADA');
    expect(payload.fin).toBe('2026-09-15T11:00:00.000Z');
    expect(horas(payload)).toBe(24);
  });
});
