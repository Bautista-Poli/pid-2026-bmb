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
  canales: ['GENERAL'],
  mensajes: [
    {
      id_mensaje: 'm1', canal: 'GENERAL', rol_autor: 'SISTEMA', texto: 'Sigue adentro', created_at: '2026-10-11T23:20:00.000Z',
      autor_nombre: null, autor_apellido: null,
    },
    {
      id_mensaje: 'm2', canal: 'GENERAL', rol_autor: 'CONDUCTOR', texto: 'En 20 minutos lo retiro',
      created_at: '2026-10-11T23:25:00.000Z', autor_nombre: 'Ana', autor_apellido: 'Paz',
    },
  ],
};

describe('aIncidenciaDetallada', () => {
  it('arma la incidencia con su reserva, conductor e hilo', () => {
    const incidencia = aIncidenciaDetallada(dto);

    expect(incidencia.id).toBe('i1');
    expect(incidencia.conductor.nombre).toBe('Ana Paz');
    expect(incidencia.reserva.estado).toBe('ACTIVA');
    expect(incidencia.reserva.egresoEn).toBeNull();
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
