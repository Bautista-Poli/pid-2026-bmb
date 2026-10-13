import { describe, expect, it } from 'vitest';
import { haceCuanto } from './tiempo.util';

const ahora = new Date('2026-10-12T15:00:00Z');

describe('haceCuanto', () => {
  it('dias, horas, minutos o recien', () => {
    expect(haceCuanto('2026-10-09T14:00:00Z', ahora)).toBe('hace 3 días');
    expect(haceCuanto('2026-10-11T14:00:00Z', ahora)).toBe('hace 1 día');
    expect(haceCuanto('2026-10-12T10:00:00Z', ahora)).toBe('hace 5 h');
    expect(haceCuanto('2026-10-12T14:40:00Z', ahora)).toBe('hace 20 min');
    expect(haceCuanto('2026-10-12T14:59:30Z', ahora)).toBe('recién');
  });
});
