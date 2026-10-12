import { Vehiculo } from '@app/models';
import { fotoDeVehiculo, miniaturaDeVehiculo } from './foto-vehiculo.util';

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
  fotoMiniatura: null,
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

describe('miniaturaDeVehiculo', () => {
  it('usa la miniatura chica de la foto propia', () => {
    const propio = { ...base, foto: 'https://x/grande.jpg', fotoMiniatura: 'https://x/chica.jpg' };
    expect(miniaturaDeVehiculo(propio)).toBe('https://x/chica.jpg');
  });

  it('sin foto propia usa la de catalogo', () => {
    expect(miniaturaDeVehiculo(base)).toBe('vehiculos/toyota-corolla.jpg');
  });
});
