import { describe, expect, it } from 'vitest';
import { IncidenciaDetalladaDto } from './api.dto';
import { aIncidenciaDetallada } from './api.mapeo';

const dto: IncidenciaDetalladaDto = {
  id_incidencia: 'i1',
  tipo: 'AUTO_EXCEDIDO',
  estado: 'ABIERTA',
  created_at: '2026-10-11T23:20:00.000Z',
  denunciada_at: null,
  denunciada_por: null,
  resuelta_at: null,
  id_reserva: 'r1',
  inicio: '2026-10-11T21:00:00.000Z',
  fin: '2026-10-11T23:00:00.000Z',
  estado_reserva: 'ACTIVA',
  egreso_real: null,
  id_conductor: 'c1',
  conductor_nombre: 'Ana',
  conductor_apellido: 'Paz',
  patente: 'AB123CD',
  cochera: 'P-1',
  id_estacionamiento: 'e1',
  estacionamiento: 'Centro',
  cantidad_mensajes: 2,
  ultimo_mensaje: 'En 20 minutos lo retiro',
  id_abono: null,
  abono_desde: null,
  abono_hasta: null,
  abono_turno: null,
  motivo: null,
  monto_pedido: null,
  propuesta_vigente: null,
  pagado: 2000,
  devuelto: 0,
  tope: 2000,
  resolucion: null,
  canales: ['GENERAL'],
  mensajes: [
    {
      id_mensaje: 'm1', canal: 'GENERAL', rol_autor: 'SISTEMA', texto: 'Sigue adentro', created_at: '2026-10-11T23:20:00.000Z',
      autor_nombre: null, autor_apellido: null, monto_propuesto: null,
    },
    {
      id_mensaje: 'm2', canal: 'GENERAL', rol_autor: 'CONDUCTOR', texto: 'En 20 minutos lo retiro',
      created_at: '2026-10-11T23:25:00.000Z', autor_nombre: 'Ana', autor_apellido: 'Paz', monto_propuesto: null,
    },
  ],
};

describe('aIncidenciaDetallada', () => {
  it('arma la incidencia con su reserva, conductor e hilo', () => {
    const incidencia = aIncidenciaDetallada(dto);

    expect(incidencia.id).toBe('i1');
    expect(incidencia.conductor.nombre).toBe('Ana Paz');
    expect(incidencia.reserva?.estado).toBe('ACTIVA');
    expect(incidencia.reserva?.egresoEn).toBeNull();
    expect(incidencia.mensajes).toHaveLength(2);
    expect(incidencia.canales).toEqual(['GENERAL']);
    expect(incidencia.mensajes[0].canal).toBe('GENERAL');
  });

  it('los mensajes del sistema no tienen autor', () => {
    const [sistema, conductor] = aIncidenciaDetallada(dto).mensajes;

    expect(sistema.autor).toBeNull();
    expect(conductor.autor).toBe('Ana Paz');
    expect(conductor.rolAutor).toBe('CONDUCTOR');
  });
});

describe('reclamos', () => {
  const deAbono: IncidenciaDetalladaDto = {
    ...dto,
    tipo: 'RECLAMO',
    id_reserva: null,
    inicio: null,
    fin: null,
    estado_reserva: null,
    patente: null,
    cochera: null,
    id_abono: 'a1',
    abono_desde: '2026-10-01',
    abono_hasta: '2026-10-30',
    abono_turno: 'MANANA',
    motivo: 'MAL_SERVICIO',
    monto_pedido: 5000,
    propuesta_vigente: 1500,
    pagado: 30000,
    devuelto: 0,
    tope: 30000,
    mensajes: [
      {
        id_mensaje: 'm3', canal: 'GENERAL', rol_autor: 'PROPIETARIO', texto: 'Te devuelvo una parte',
        created_at: '2026-10-11T23:25:00.000Z', autor_nombre: 'Luis', autor_apellido: 'Gil', monto_propuesto: 1500,
      },
    ],
  };

  it('un reclamo de abono no tiene reserva y trae los montos', () => {
    const reclamo = aIncidenciaDetallada(deAbono);

    expect(reclamo.reserva).toBeNull();
    expect(reclamo.abono).toEqual({ id: 'a1', desde: '2026-10-01', hasta: '2026-10-30', turno: 'MANANA' });
    expect(reclamo.motivo).toBe('MAL_SERVICIO');
    expect(reclamo.montoPedido).toBe(5000);
    expect(reclamo.propuestaVigente).toBe(1500);
    expect(reclamo.tope).toBe(30000);
    expect(reclamo.mensajes[0].montoPropuesto).toBe(1500);
  });

  it('una incidencia del sistema sigue teniendo su reserva y ningun abono', () => {
    const incidencia = aIncidenciaDetallada(dto);

    expect(incidencia.abono).toBeNull();
    expect(incidencia.reserva?.id).toBe('r1');
    expect(incidencia.motivo).toBeNull();
  });
});
