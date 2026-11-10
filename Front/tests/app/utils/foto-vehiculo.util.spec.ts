import { Vehiculo } from '@app/models';
import { fotoDeVehiculo } from '@app/utils/foto-vehiculo.util';

const base: Vehiculo = {
  id: 'v1',
  usuarioId: 'u1',
  patente: 'AB123CD',
  marca: 'Toyota',
  modelo: 'Corolla',
  color: null,
  tipo: 'AUTO',
  predeterminado: true,
  activo: true,
};

describe('fotoDeVehiculo', () => {
  it('usa la foto de catalogo del modelo', () => {
    expect(fotoDeVehiculo(base)).toBe('vehiculos/toyota-corolla.jpg');
  });

  it('sin foto de catalogo devuelve null', () => {
    expect(fotoDeVehiculo({ ...base, marca: 'Marca', modelo: 'Rara' })).toBeNull();
  });
});
