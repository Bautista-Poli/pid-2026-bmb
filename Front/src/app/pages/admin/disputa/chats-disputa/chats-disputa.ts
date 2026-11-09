import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { Boton, Tarjeta } from '@app/components/ui';
import { CanalIncidencia, ETIQUETA_AUTOR, IncidenciaModerada, MensajeIncidencia } from '@app/models';
import { AdminService } from '@app/services/admin/admin.service';
import { pesos } from '../formato';

const PESTANIAS: { canal: CanalIncidencia; etiqueta: string }[] = [
  { canal: 'GENERAL', etiqueta: 'Entre las partes' },
  { canal: 'CONDUCTOR', etiqueta: 'Con el conductor' },
  { canal: 'PROPIETARIO', etiqueta: 'Con el estacionamiento' },
];

/**
 * Los chats de una disputa (disputa.ts): el de las partes (solo lectura) y los
 * privados con el conductor y con el estacionamiento. Mientras esta denunciada,
 * el admin escribe en los privados; avisa con `actualizada` la incidencia que
 * devuelve la API.
 */
@Component({
  selector: 'app-chats-disputa',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, Boton, Tarjeta],
  templateUrl: './chats-disputa.html',
  styleUrls: ['../compartido.css', './chats-disputa.css'],
  host: { style: 'display: contents' },
})
export class ChatsDisputa {
  private readonly admin = inject(AdminService);

  readonly d = input.required<IncidenciaModerada>();

  readonly actualizada = output<IncidenciaModerada>();

  protected readonly pestanias = PESTANIAS;
  protected readonly pesos = pesos;

  protected readonly canal = signal<CanalIncidencia>('GENERAL');
  protected readonly mensajes = computed(() => this.d().mensajes.filter((m) => m.canal === this.canal()));

  protected readonly borrador = signal('');
  protected readonly enviando = signal(false);
  protected readonly error = signal<string | null>(null);

  protected autor(mensaje: MensajeIncidencia): string {
    const rol = mensaje.rolAutor === 'ADMINISTRADOR' ? 'Vos (moderación)' : ETIQUETA_AUTOR[mensaje.rolAutor];
    return mensaje.autor && mensaje.rolAutor !== 'ADMINISTRADOR' ? `${mensaje.autor} · ${rol}` : rol;
  }

  protected leer(evento: Event): string {
    return (evento.target as HTMLTextAreaElement).value;
  }

  /** Manda un mensaje al chat privado con una de las partes. */
  protected escribir(): void {
    const texto = this.borrador().trim();
    const canal = this.canal();
    if (!texto || canal === 'GENERAL' || this.enviando()) return;
    this.enviando.set(true);
    this.error.set(null);
    this.admin.escribir(this.d().id, texto, canal).subscribe({
      next: (actualizada) => {
        this.enviando.set(false);
        this.borrador.set('');
        this.actualizada.emit(actualizada);
      },
      error: (e: Error) => {
        this.enviando.set(false);
        this.error.set(e.message);
      },
    });
  }
}
