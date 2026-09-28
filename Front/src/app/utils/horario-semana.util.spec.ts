import { FranjaAtencion } from '@app/models';
import { estadoApertura, resumenSemana } from './horario-semana.util';

const habiles: FranjaAtencion[] = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES'].map(
  (dia) => ({ dia, desde: '08:00', hasta: '20:00' }) as FranjaAtencion,
);
const conSabado: FranjaAtencion[] = [...habiles, { dia: 'SABADO', desde: '09:00', hasta: '13:00' }];

/** Lunes 28/9/2026 a la hora indicada. */
const lunesA = (hora: number, minuto = 0) => new Date(2026, 8, 28, hora, minuto);

describe('estadoApertura', () => {
  it('abierto dentro de la franja, con la hora de cierre', () => {
    expect(estadoApertura(habiles, lunesA(10))).toEqual({ abierto: true, texto: 'Abierto · Cierra 20:00' });
  });

  it('antes de abrir dice cuando abre', () => {
    expect(estadoApertura(habiles, lunesA(7, 30))).toEqual({ abierto: false, texto: 'Cerrado · Abre 08:00' });
  });

  it('un dia sin franja esta cerrado', () => {
    expect(estadoApertura(habiles, new Date(2026, 8, 27, 12)).texto).toBe('Cerrado hoy');
  });

  it('00:00 a 23:59 es abierto las 24 h', () => {
    const siempre: FranjaAtencion[] = [{ dia: 'LUNES', desde: '00:00', hasta: '23:59' }];
    expect(estadoApertura(siempre, lunesA(3)).texto).toBe('Abierto las 24 h');
  });
});

describe('resumenSemana', () => {
  it('agrupa los dias seguidos con el mismo horario', () => {
    expect(resumenSemana(conSabado)).toEqual([
      'Lun a Vie · 08:00 – 20:00',
      'Sáb · 09:00 – 13:00',
      'Dom · Cerrado',
    ]);
  });

  it('si todos los dias son iguales lo dice en una linea', () => {
    const todos = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'].map(
      (dia) => ({ dia, desde: '00:00', hasta: '23:59' }) as FranjaAtencion,
    );
    expect(resumenSemana(todos)).toEqual(['Todos los días · 24 h']);
  });

  it('sin horarios lo avisa', () => {
    expect(resumenSemana([])).toEqual(['Sin horario cargado']);
  });
});
