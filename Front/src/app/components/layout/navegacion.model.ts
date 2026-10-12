import { NombreIcono } from '@app/components/ui';

/** Item de navegacion compartido por la tab bar mobile y el sidebar desktop. */
export interface ItemNavegacion {
  ruta: string;
  etiqueta: string;
  icono: NombreIcono;
  /**
   * `false` = no va en la tab bar mobile (no entra: cada pestana necesita su
   * ancho). Se llega desde otra pantalla; en escritorio esta en la barra.
   */
  enTabs?: boolean;
}
