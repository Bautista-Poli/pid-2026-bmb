import { NuevaReserva, NuevoEstacionamiento } from '@app/models';
import { ReservaDto } from './api.dto';
import { aAbono, aPayloadEstacionamiento, aPayloadReserva, aReserva } from './api.mapeo';

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

describe('aAbono', () => {
  it('traduce el abono y sus usos', () => {
    const abono = aAbono({
      id_abono: 'a1',
      id_conductor: 'c1',
      conductor_nombre: 'Ana',
      conductor_apellido: 'Paz',
      id_estacionamiento: 'e1',
      estacionamiento: 'Centro',
      id_plan: 'p1',
      turno: 'MANANA',
      cupos_totales: 20,
      cupos_usados: 6,
      cupos_restantes: 14,
      precio_total: 40000,
      desde: '2026-10-08',
      hasta: '2026-11-06',
      estado: 'VIGENTE',
      created_at: '2026-10-08T12:00:00.000Z',
    });

    expect(abono).toMatchObject({
      id: 'a1',
      conductor: 'Ana Paz',
      estacionamiento: 'Centro',
      turno: 'MANANA',
      cuposTotales: 20,
      cuposRestantes: 14,
      hasta: '2026-11-06',
    });
  });
});

describe('aReserva con abono', () => {
  it('muestra la modalidad por hora y guarda el abono', () => {
    const reserva = aReserva({
      id_reserva: 'r1', id_conductor: 'c1',
      inicio: '2026-10-09T11:00:00.000Z', fin: '2026-10-09T13:00:00.000Z',
      estado: 'CONFIRMADA', created_at: '2026-10-08T12:00:00.000Z',
      ingreso_real: null, egreso_real: null,
      id_vehiculo: 'v1', patente: 'AB123CD', marca: null, modelo: null, id_tipo_vehiculo: 1,
      id_cochera: 'k1', cochera: 'P-1', cochera_sector: null, cochera_cubierta: false,
      id_estacionamiento: 'e1', estacionamiento: 'Centro', direccion: 'Calle 1',
      precio_total: 0, modalidad: 'ABONO', motivo_reasignacion: null,
      codigo_acceso: 'K7MQ2XTR', id_abono: 'a1', turno_abono: 'MANANA',
    } as ReservaDto);

    expect(reserva.modalidad).toBe('HORA');
    expect(reserva.abono).toEqual({ id: 'a1', turno: 'MANANA' });
  });
});
