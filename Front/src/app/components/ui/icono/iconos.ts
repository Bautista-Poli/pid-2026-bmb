// Dibujos de los iconos de la app. Cada uno es una lista de figuras sobre un
// lienzo de 24x24 (ver icono.ts, que los dibuja todos con el mismo trazo).
//
// Para agregar un icono: sumar una entrada en el grupo que corresponda. El
// nombre queda disponible solo en <ui-icono nombre="..."> (NombreIcono sale de
// las claves de ICONOS).

/** Una figura del dibujo: un camino SVG, un circulo o un rectangulo redondeado. */
export type Figura =
  | { tipo: 'camino'; d: string }
  | { tipo: 'circulo'; cx: number; cy: number; r: number; lleno: boolean }
  | { tipo: 'rectangulo'; x: number; y: number; ancho: number; alto: number; radio: number };

/** Camino SVG (atributo `d` de un <path>). */
const camino = (d: string): Figura => ({ tipo: 'camino', d });
/** Circulo de contorno. */
const circulo = (cx: number, cy: number, r: number): Figura => ({ tipo: 'circulo', cx, cy, r, lleno: false });
/** Circulo lleno, sin contorno (un punto). */
const punto = (cx: number, cy: number, r: number): Figura => ({ tipo: 'circulo', cx, cy, r, lleno: true });
/** Rectangulo con las esquinas redondeadas. */
const rectangulo = (x: number, y: number, ancho: number, alto: number, radio: number): Figura => ({
  tipo: 'rectangulo',
  x,
  y,
  ancho,
  alto,
  radio,
});

export const ICONOS = {
  /* ------ Secciones de la app (menu y pestañas) */
  inicio: [
    camino('M3.8 10.4 12 3.8l8.2 6.6'),
    camino('M5.8 8.9v10.3a1 1 0 0 0 1 1h3.4v-5.6h3.6v5.6h3.4a1 1 0 0 0 1-1V8.9'),
  ],
  explorar: [
    camino('M12 21s6.5-5.4 6.5-10.5a6.5 6.5 0 1 0-13 0C5.5 15.6 12 21 12 21Z'),
    circulo(12, 10.5, 2.4),
  ],
  reservas: [
    rectangulo(3.5, 5, 17, 15.5, 2.2),
    camino('M3.5 9.5h17'),
    camino('M8 3.5v3.2M16 3.5v3.2'),
    camino('M8.8 14.7l2.1 2.1 4.3-4.3'),
  ],
  tablero: [
    rectangulo(3.5, 3.5, 7.2, 7.2, 1.4),
    rectangulo(13.3, 3.5, 7.2, 7.2, 1.4),
    rectangulo(3.5, 13.3, 7.2, 7.2, 1.4),
    rectangulo(13.3, 13.3, 7.2, 7.2, 1.4),
  ],
  estacionamiento: [
    rectangulo(3.8, 3.8, 16.4, 16.4, 3.4),
    camino('M9.5 16.5V7.8h3.1a2.85 2.85 0 0 1 0 5.7H9.5'),
  ],
  perfil: [circulo(12, 8.3, 3.8), camino('M4.8 20.2c.9-3.6 3.7-5.6 7.2-5.6s6.3 2 7.2 5.6')],
  configuracion: [
    camino('M12.22 2.5h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73v.18a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4.5a2 2 0 0 0-2-2Z'),
    circulo(12, 12, 3),
  ],
  salida: [
    camino('M14.6 7.4V5.2a1.7 1.7 0 0 0-1.7-1.7H5.6a1.7 1.7 0 0 0-1.7 1.7v13.6a1.7 1.7 0 0 0 1.7 1.7h7.3a1.7 1.7 0 0 0 1.7-1.7v-2.2'),
    camino('M9.6 12h10.5m0 0-3.2-3.2M20.1 12l-3.2 3.2'),
  ],

  /* ------ Vehiculos */
  auto: [
    camino('M5 11.2l1.4-4A2 2 0 0 1 8.3 5.8h7.4a2 2 0 0 1 1.9 1.4l1.4 4'),
    camino('M4 11.2h16a1.5 1.5 0 0 1 1.5 1.5V16a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1v-3.3a1.5 1.5 0 0 1 1.5-1.5Z'),
    circulo(7.3, 16.2, 1.6),
    circulo(16.7, 16.2, 1.6),
  ],
  moto: [
    circulo(5.6, 16.9, 3.3),
    circulo(18.4, 16.9, 3.3),
    camino('M5.6 16.9 9.4 11h5l4 5.9'),
    camino('M9.4 11 7.9 8.3h3.2'),
    camino('M14.4 11l2.6-2.7h2.3'),
  ],
  camioneta: [
    camino('M2.5 15.8V8.6a1.1 1.1 0 0 1 1.1-1.1h9.2v8.3'),
    camino('M12.8 10.3h4.1a1.5 1.5 0 0 1 1.2.6l2.9 3.8v1.1a1 1 0 0 1-1 1H2.5'),
    circulo(7, 17.1, 1.7),
    circulo(17.1, 17.1, 1.7),
  ],

  /* ------ Acciones */
  mas: [camino('M12 5.2v13.6M5.2 12h13.6')],
  menos: [camino('M5.2 12h13.6')],
  editar: [
    camino('M14.5 5.7l3.8 3.8M4 20l4.2-.9L19 8.3a2 2 0 0 0 0-2.8l-.5-.5a2 2 0 0 0-2.8 0L4.9 15.8 4 20Z'),
  ],
  cerrar: [camino('M6.6 6.6l10.8 10.8M17.4 6.6L6.6 17.4')],
  buscar: [circulo(10.8, 10.8, 6.3), camino('m15.5 15.5 4.4 4.4')],
  filtros: [camino('M4 7h9.5M17.5 7H20M4 17h2.5M10.5 17H20'), circulo(15.5, 7, 2), circulo(8.5, 17, 2)],
  intercambiar: [camino('M7.4 4.6 3.9 8.1l3.5 3.5M3.9 8.1h12.4M16.6 19.4l3.5-3.5-3.5-3.5M20.1 15.9H7.7')],
  navegar: [camino('M20.2 3.8 3.9 10.6l7 2.5 2.5 7 6.8-16.3Z')],
  ubicar: [circulo(12, 12, 6.4), circulo(12, 12, 2.1), camino('M12 2.6v3M12 18.4v3M2.6 12h3M18.4 12h3')],

  /* ------ Flechas */
  cheuron: [camino('M6.5 9.4 12 14.9l5.5-5.5')],
  derecha: [camino('M9.4 6.5 14.9 12l-5.5 5.5')],
  subir: [camino('M12 19V5.5M6.5 11 12 5.5l5.5 5.5')],
  bajar: [camino('M12 5v13.5M6.5 13l5.5 5.5 5.5-5.5')],

  /* ------ Tiempo y dinero */
  reloj: [circulo(12, 12, 8.2), camino('M12 7.4V12l3 1.8')],
  calendario: [rectangulo(3.5, 5, 17, 15.5, 2.2), camino('M3.5 9.5h17M8 3.5v3.2M16 3.5v3.2')],
  moneda: [
    circulo(12, 12, 8.2),
    camino('M14.6 9.2c-.4-.9-1.4-1.4-2.6-1.4-1.5 0-2.6.8-2.6 2s1.1 1.7 2.6 2c1.5.3 2.6.8 2.6 2s-1.1 2-2.6 2c-1.2 0-2.2-.5-2.6-1.4M12 6.3v1.5M12 16.2v1.5'),
  ],

  /* ------ Lugares (sugerencias del buscador y datos del estacionamiento) */
  calle: [camino('M8.2 3.5 5.4 20.5M15.8 3.5l2.8 17'), camino('M12 4.5v2.6M12 10.7v2.6M12 16.9v2.6')],
  esquina: [camino('M9 3.5v17M15 3.5v17M3.5 9h17M3.5 15h17'), punto(12, 12, 1.3)],
  ciudad: [
    camino('M3.5 20.5h17'),
    camino('M5.5 20.5V9.4l5-2.4v13.5'),
    camino('M10.5 20.5V4.2l8 3.3v13'),
    camino('M13.4 9.2h2.2M13.4 12.4h2.2M13.4 15.6h2.2M7.5 12.4h1M7.5 15.6h1'),
  ],
  arbol: [
    camino('M12 21v-6.2'),
    camino('M12 14.8c3.9 0 6.4-2.1 6.4-5.1 0-2.6-2-4.6-4.3-5-.6-1-1.3-1.2-2.1-1.2s-1.5.2-2.1 1.2c-2.3.4-4.3 2.4-4.3 5 0 3 2.5 5.1 6.4 5.1Z'),
    camino('M9.4 21h5.2'),
  ],
  edificio: [
    rectangulo(5, 3.5, 14, 17, 1.6),
    camino('M9 7.5h1.5M13.5 7.5H15M9 11h1.5M13.5 11H15M9 14.5h1.5M13.5 14.5H15'),
    camino('M10.5 20.5v-2.6h3v2.6'),
  ],
  techo: [
    camino('M3.5 11.2 12 4.5l8.5 6.7'),
    camino('M5.8 9.6v9.9h12.4V9.6'),
    camino('M9.6 19.5v-5.2h4.8v5.2'),
  ],

  /* ------ Tema claro / oscuro / del sistema */
  sol: [
    circulo(12, 12, 4),
    camino('M12 2.6v2.2M12 19.2v2.2M4.4 4.4l1.6 1.6M18 18l1.6 1.6M2.6 12h2.2M19.2 12h2.2M4.4 19.6l1.6-1.6M18 6l1.6-1.6'),
  ],
  luna: [camino('M20.6 14.2A8.6 8.6 0 0 1 9.8 3.4a8.6 8.6 0 1 0 10.8 10.8Z')],
  sistema: [rectangulo(2.8, 4.4, 18.4, 12, 2), camino('M8.6 19.6h6.8M12 16.4v3.2')],

  /* ------ Estados y marcas */
  alerta: [
    camino('M10.3 4.2 2.9 17.3A2 2 0 0 0 4.6 20.3h14.8a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0Z'),
    camino('M12 9.5v4.2'),
    camino('M12 16.9h.01'),
  ],
  candado: [rectangulo(5.3, 10.8, 13.4, 9.7, 2), camino('M8 10.8V7.9a4 4 0 0 1 8 0v2.9'), punto(12, 15, 1.3)],
  ojo: [camino('M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z'), circulo(12, 12, 2.8)],
  'ojo-tachado': [
    camino('M10 5.7A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2.6 3.4'),
    camino('M6.5 7.6C3.9 9.4 2.5 12 2.5 12S6 18.5 12 18.5a9 9 0 0 0 4.6-1.2'),
    camino('M10 10a2.8 2.8 0 0 0 4 4'),
    camino('M3.5 3.5l17 17'),
  ],
  estrella: [camino('M12 3.8l2.5 5 5.5.8-4 3.9.9 5.5-4.9-2.6L7.1 19l.9-5.5-4-3.9 5.5-.8Z')],
  corazon: [
    camino('M12 20.2s-7.5-4.4-7.5-10A4.1 4.1 0 0 1 12 7.6a4.1 4.1 0 0 1 7.5 2.6c0 5.6-7.5 10-7.5 10Z'),
  ],
} satisfies Record<string, Figura[]>;

/** Nombre de un icono: cualquier clave de ICONOS. */
export type NombreIcono = keyof typeof ICONOS;
