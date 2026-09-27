import { DOCUMENT } from '@angular/common';
import { Injectable, computed, effect, inject, signal } from '@angular/core';

/** Lo que elige el usuario. `sistema` sigue al modo del sistema operativo. */
export type PreferenciaTema = 'sistema' | 'claro' | 'oscuro';

const CLAVE_TEMA = 'parkit.tema';
const CONSULTA_OSCURO = '(prefers-color-scheme: dark)';

/**
 * Modo dia / modo noche.
 *
 * La paleta entera vive en los tokens de `src/tailwind.css`, asi que cambiar de
 * tema es estampar `data-theme` en el elemento raiz: el CSS redefine los mismos
 * custom properties y toda la app se repinta sola.
 */
@Injectable({ providedIn: 'root' })
export class TemaService {
  private readonly documento = inject(DOCUMENT);

  private readonly preferencia = signal<PreferenciaTema>(this.leerGuardada());
  private readonly sistemaEnOscuro = signal(this.consultarSistema());

  /** La opcion elegida, incluida `sistema`. */
  readonly elegida = this.preferencia.asReadonly();

  /** El tema que se esta viendo ahora, ya resuelto. */
  readonly esOscuro = computed(() => {
    const elegida = this.preferencia();
    return elegida === 'sistema' ? this.sistemaEnOscuro() : elegida === 'oscuro';
  });

  constructor() {
    this.escucharAlSistema();

    // Con `sistema` no se estampa nada: manda el `prefers-color-scheme` del CSS.
    effect(() => {
      const elegida = this.preferencia();
      const raiz = this.documento.documentElement;

      if (elegida === 'sistema') {
        raiz.removeAttribute('data-theme');
      } else {
        raiz.setAttribute('data-theme', elegida);
      }
    });
  }

  elegir(preferencia: PreferenciaTema): void {
    this.preferencia.set(preferencia);
    this.guardar(preferencia);
  }

  /** Atajo para un interruptor de dos posiciones. */
  alternar(): void {
    this.elegir(this.esOscuro() ? 'claro' : 'oscuro');
  }

  private escucharAlSistema(): void {
    const consulta = this.documento.defaultView?.matchMedia?.(CONSULTA_OSCURO);
    if (!consulta) return;

    consulta.addEventListener('change', (evento) => this.sistemaEnOscuro.set(evento.matches));
  }

  private consultarSistema(): boolean {
    return this.documento.defaultView?.matchMedia?.(CONSULTA_OSCURO).matches ?? false;
  }

  // El acceso a localStorage puede tirar (ventana privada, cookies bloqueadas):
  // sin memoria la app sigue andando, solo que arranca en `sistema`.
  private leerGuardada(): PreferenciaTema {
    try {
      const guardada = localStorage.getItem(CLAVE_TEMA);
      return guardada === 'claro' || guardada === 'oscuro' ? guardada : 'sistema';
    } catch {
      return 'sistema';
    }
  }

  private guardar(preferencia: PreferenciaTema): void {
    try {
      if (preferencia === 'sistema') {
        localStorage.removeItem(CLAVE_TEMA);
      } else {
        localStorage.setItem(CLAVE_TEMA, preferencia);
      }
    } catch {
      /* sin memoria: la eleccion vale hasta que se recargue */
    }
  }
}
