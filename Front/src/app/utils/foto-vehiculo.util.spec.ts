import { Vehiculo } from '@app/models';
import { fotoDeVehiculo } from './foto-vehiculo.util';

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
  foto: null,
};

describe('fotoDeVehiculo', () => {
  it('prefiere la foto que subio el conductor', () => {
    expect(fotoDeVehiculo({ ...base, foto: 'https://res.cloudinary.com/x/auto.jpg' })).toBe(
      'https://res.cloudinary.com/x/auto.jpg',
    );
  });

  it('sin foto propia usa la de catalogo del modelo', () => {
    expect(fotoDeVehiculo(base)).toBe('vehiculos/toyota-corolla.jpg');
  });

  it('sin foto propia ni de catalogo devuelve null', () => {
    expect(fotoDeVehiculo({ ...base, marca: 'Marca', modelo: 'Rara' })).toBeNull();
  });
});
