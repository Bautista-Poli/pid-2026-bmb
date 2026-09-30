import { Direccion, direccionCorta } from '@app/models';

export interface LinkComoLlegar {
  app: 'Google Maps' | 'Waze' | 'Apple Maps';
  url: string;
}

/**
 * Links para que el conductor abra la navegacion hasta el estacionamiento.
 * Son links universales: en el celular abren la app si esta instalada y si no,
 * la version web. Con coordenadas van al punto exacto; sin ellas, a la
 * direccion escrita (con provincia, para que no la busque en otra ciudad).
 */
export function linksComoLlegar(direccion: Direccion): LinkComoLlegar[] {
  const { latitud, longitud } = direccion;
  const conCoordenadas = latitud !== null && longitud !== null;
  const destino = encodeURIComponent(
    conCoordenadas
      ? `${latitud},${longitud}`
      : `${direccionCorta(direccion)}, ${direccion.provincia}`,
  );

  return [
    {
      app: 'Google Maps',
      url: `https://www.google.com/maps/dir/?api=1&destination=${destino}`,
    },
    {
      app: 'Waze',
      url: `https://waze.com/ul?${conCoordenadas ? 'll' : 'q'}=${destino}&navigate=yes`,
    },
    { app: 'Apple Maps', url: `https://maps.apple.com/?daddr=${destino}` },
  ];
}
