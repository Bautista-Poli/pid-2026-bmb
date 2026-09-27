import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Modal } from './modal';

@Component({
  imports: [Modal],
  template: `
    <ui-modal titulo="Cambiar contraseña" [abierto]="abierto()" (cerrado)="abierto.set(false)">
      <button type="button">Adentro</button>
    </ui-modal>
  `,
})
class Anfitrion {
  readonly abierto = signal(false);
}

describe('Modal', () => {
  // jsdom trae HTMLDialogElement pero no `showModal()`/`close()`. El polyfill
  // imita lo justo: reflejar `open` y emitir `close`, que es de lo que depende
  // el componente. En el navegador estos metodos son nativos.
  beforeAll(() => {
    const proto = HTMLDialogElement.prototype as unknown as Record<string, unknown>;
    if (typeof proto['showModal'] === 'function') return;

    proto['showModal'] = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    proto['close'] = function (this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  });

  async function montar() {
    await TestBed.configureTestingModule({ imports: [Anfitrion] }).compileComponents();
    const fixture = TestBed.createComponent(Anfitrion);
    fixture.detectChanges();
    const dialogo = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    return { fixture, dialogo };
  }

  it('arranca cerrado', async () => {
    const { dialogo } = await montar();
    expect(dialogo.open).toBe(false);
  });

  it('se abre y se cierra siguiendo a `abierto`', async () => {
    const { fixture, dialogo } = await montar();

    fixture.componentInstance.abierto.set(true);
    fixture.detectChanges();
    expect(dialogo.open).toBe(true);

    fixture.componentInstance.abierto.set(false);
    fixture.detectChanges();
    expect(dialogo.open).toBe(false);
  });

  it('avisa `cerrado` cuando el navegador lo cierra (Escape)', async () => {
    const { fixture, dialogo } = await montar();
    fixture.componentInstance.abierto.set(true);
    fixture.detectChanges();

    // Escape dispara el evento `close` nativo del <dialog>.
    dialogo.dispatchEvent(new Event('close'));
    fixture.detectChanges();

    expect(fixture.componentInstance.abierto()).toBe(false);
  });

  it('avisa `cerrado` al tocar el boton de la X', async () => {
    const { fixture } = await montar();
    fixture.componentInstance.abierto.set(true);
    fixture.detectChanges();

    const cerrar = fixture.nativeElement.querySelector(
      'button[aria-label="Cerrar"]',
    ) as HTMLButtonElement;
    cerrar.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.abierto()).toBe(false);
  });

  it('el titulo le da nombre accesible al dialogo', async () => {
    const { fixture, dialogo } = await montar();
    const titulo = fixture.nativeElement.querySelector('h2') as HTMLElement;

    expect(dialogo.getAttribute('aria-labelledby')).toBe(titulo.id);
    expect(titulo.textContent?.trim()).toBe('Cambiar contraseña');
  });
});
