import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Boton, Tarjeta } from '@app/components/ui';
import { SelectorUbicacion } from '../selector-ubicacion/selector-ubicacion';
import { DiaSemana, Estacionamiento, NuevoEstacionamiento } from '@app/models';
import { ID_CABA, PROVINCIAS } from '@app/utils/direcciones.util';
import { Coordenadas } from '@app/utils/distancia.util';
import { opcionesHora } from '@app/utils/horario-semana.util';

const DIAS: { dia: DiaSemana; etiqueta: string }[] = [
  { dia: 'LUNES', etiqueta: 'Lunes' },
  { dia: 'MARTES', etiqueta: 'Martes' },
  { dia: 'MIERCOLES', etiqueta: 'Miércoles' },
  { dia: 'JUEVES', etiqueta: 'Jueves' },
  { dia: 'VIERNES', etiqueta: 'Viernes' },
  { dia: 'SABADO', etiqueta: 'Sábado' },
  { dia: 'DOMINGO', etiqueta: 'Domingo' },
];

const DIAS_HABILES: DiaSemana[] = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES'];

// Un dia abierto necesita que el cierre sea despues de la apertura.
function horarioValido(grupo: AbstractControl): ValidationErrors | null {
  const { abierto, desde, hasta } = grupo.value;
  return abierto && (!desde || !hasta || hasta <= desde) ? { horarioInvalido: true } : null;
}

// El estacionamiento tiene que ofrecer al menos una modalidad (vacio = no la ofrece).
function algunaTarifa(grupo: AbstractControl): ValidationErrors | null {
  const { tarifaHora, tarifaEstadia, tarifaJornada } = grupo.value;
  const ofrecida = [tarifaHora, tarifaEstadia, tarifaJornada].some((t) => t !== null && t !== '');
  return ofrecida ? null : { sinTarifa: true };
}

/**
 * Formulario de un estacionamiento, compartido por el alta y la edicion.
 * Si recibe un `estacionamiento` precarga sus datos; si no, arranca vacio.
 * Emite los datos ya validados por `guardar`: quien lo usa decide si llama a
 * crear o a actualizar.
 */
@Component({
  selector: 'app-formulario-estacionamiento',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, Boton, SelectorUbicacion, Tarjeta],
  templateUrl: './formulario-estacionamiento.html',
})
export class FormularioEstacionamiento {
  private readonly fb = inject(FormBuilder);

  /** Estacionamiento a editar. `null` (el default) es el modo alta. */
  readonly estacionamiento = input<Estacionamiento | null>(null);
  readonly enviando = input(false);
  readonly error = input<string | null>(null);
  readonly textoEnviar = input('Guardar');

  readonly guardar = output<NuevoEstacionamiento>();

  protected readonly dias = DIAS;
  /** Selector de hora en 24 h (el `type="time"` nativo sale en AM/PM segun el idioma del sistema). */
  protected readonly horas = opcionesHora;

  /** Mismos limites que valida el backend (estacionamiento.validator.js). */
  protected readonly formulario = this.fb.nonNullable.group({
    nombre: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(120)]],
    descripcion: ['', [Validators.maxLength(500)]],
    calle: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(120)]],
    numero: ['', [Validators.required, Validators.maxLength(10)]],
    ciudad: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(80)]],
    provincia: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(80)]],
    codigoPostal: ['', [Validators.maxLength(10)]],
    barrioZona: ['', [Validators.maxLength(120)]],
    telefono: ['', [Validators.maxLength(30)]],
    email: ['', [Validators.email, Validators.maxLength(160)]],
    tarifaHora: [null as number | null, [Validators.min(0)]],
    tarifaEstadia: [null as number | null, [Validators.min(0)]],
    tarifaJornada: [null as number | null, [Validators.min(0)]],
    /** Horas minimas de anticipacion para cancelar. `null` = sin restriccion. */
    politicaCancelacionHoras: [null as number | null, [Validators.min(0)]],
    cubierto: false,
    horarios: this.fb.nonNullable.array(
      DIAS.map(({ dia }) =>
        this.fb.nonNullable.group(
          {
            dia: this.fb.nonNullable.control<DiaSemana>(dia),
            abierto: DIAS_HABILES.includes(dia),
            desde: '08:00',
            hasta: '20:00',
          },
          { validators: horarioValido },
        ),
      ),
    ),
  }, { validators: algunaTarifa });

  protected readonly horarios = this.formulario.controls.horarios;

  /* ------------------------------- Direccion ------------------------------- */
  // Provincia de una lista fija; ciudad y calle se escriben a mano. Las
  // coordenadas las marca el propietario en el mapa (no se geocodifica).

  protected readonly provincias = PROVINCIAS;

  /** El punto que marco el propietario en el mapa. */
  protected readonly ubicacion = signal<Coordenadas | null>(null);
  private readonly intentoEnviar = signal(false);
  protected readonly faltaUbicacion = computed(() => this.intentoEnviar() && !this.ubicacion());

  constructor() {
    const { provincia, ciudad, calle } = this.formulario.controls;

    // Cadena provincia -> ciudad -> calle: cambiar una borra las que dependen
    // de ella, y cada una esta deshabilitada hasta que se elige la anterior.
    ciudad.disable({ emitEvent: false });
    calle.disable({ emitEvent: false });

    provincia.valueChanges.pipe(takeUntilDestroyed()).subscribe((valor) => {
      ciudad.setValue('');
      if (valor) ciudad.enable({ emitEvent: false });
      else ciudad.disable({ emitEvent: false });
      this.elegirCiudadUnica(valor);
    });

    ciudad.valueChanges.pipe(takeUntilDestroyed()).subscribe((valor) => {
      if (valor) {
        calle.enable({ emitEvent: false });
        return;
      }
      calle.setValue('', { emitEvent: false });
      calle.disable({ emitEvent: false });
    });

    // Al abrir el editor, el formulario se precarga con lo que hay cargado.
    // `untracked`: al cargar los campos corren las suscripciones de la cadena de
    // direccion, que leen otras senales; no tienen que volver a disparar esto.
    effect(() => {
      const estacionamiento = this.estacionamiento();
      if (!estacionamiento) return;
      untracked(() => {

        const { direccion } = estacionamiento;
        if (direccion.latitud != null && direccion.longitud != null) {
          this.ubicacion.set({ latitud: direccion.latitud, longitud: direccion.longitud });
        }
        // En orden: cada campo de la cadena borra los que dependen de el.
        provincia.setValue(direccion.provincia);
        ciudad.setValue(direccion.ciudad);
        calle.setValue(direccion.calle);

        this.formulario.patchValue({
          nombre: estacionamiento.nombre,
          descripcion: estacionamiento.descripcion,
          numero: direccion.numero,
          codigoPostal: direccion.codigoPostal,
          barrioZona: estacionamiento.barrioZona ?? '',
          telefono: estacionamiento.telefonoContacto ?? '',
          email: estacionamiento.emailContacto ?? '',
          tarifaHora: estacionamiento.tarifas.hora,
          tarifaEstadia: estacionamiento.tarifas.estadia,
          tarifaJornada: estacionamiento.tarifas.jornada,
          politicaCancelacionHoras: estacionamiento.politicaCancelacionHoras,
          cubierto: estacionamiento.cubierto,
        });

        // Los dias que no vienen en `horarios` estan cerrados.
        this.horarios.controls.forEach((grupo) => {
          const franja = estacionamiento.horarios.find(
            (horario) => horario.dia === grupo.controls.dia.value,
          );
          grupo.patchValue({
            abierto: Boolean(franja),
            desde: franja?.desde ?? '08:00',
            hasta: franja?.hasta ?? '20:00',
          });
        });
      });
    });
  }

  /** CABA tiene una sola ciudad, que se llama igual: se completa sola. No pisa una ya cargada. */
  private elegirCiudadUnica(provinciaNombre: string): void {
    const provincia = this.provincias.find((p) => p.nombre === provinciaNombre);
    const { ciudad } = this.formulario.controls;
    if (provincia?.id === ID_CABA && !ciudad.value) ciudad.setValue(provincia.nombre);
  }

  protected invalido(campo: string): boolean {
    const control = this.formulario.get(campo);
    return Boolean(control?.invalid && control.touched);
  }

  /** Valida el formulario, arma los datos del estacionamiento y los emite al padre. */
  protected enviar(): void {
    this.intentoEnviar.set(true);
    if (this.formulario.invalid || this.faltaUbicacion()) {
      this.formulario.markAllAsTouched();
      return;
    }

    const valores = this.formulario.getRawValue();
    this.guardar.emit({
      nombre: valores.nombre.trim(),
      descripcion: valores.descripcion.trim(),
      direccion: {
        calle: valores.calle.trim(),
        numero: valores.numero.trim(),
        ciudad: valores.ciudad.trim(),
        provincia: valores.provincia.trim(),
        codigoPostal: valores.codigoPostal.trim(),
        // Las que marco el propietario en el mapa.
        latitud: this.ubicacion()!.latitud,
        longitud: this.ubicacion()!.longitud,
      },
      barrioZona: valores.barrioZona.trim() || null,
      telefonoContacto: valores.telefono.trim() || null,
      emailContacto: valores.email.trim() || null,
      tarifas: {
        hora: valores.tarifaHora,
        estadia: valores.tarifaEstadia,
        jornada: valores.tarifaJornada,
      },
      politicaCancelacionHoras: valores.politicaCancelacionHoras,
      cubierto: valores.cubierto,
      // La publicacion se maneja aparte, desde la pantalla de edicion.
      publicado: this.estacionamiento()?.publicado ?? true,
      horarios: valores.horarios
        .filter((horario) => horario.abierto)
        .map(({ dia, desde, hasta }) => ({ dia, desde, hasta })),
    });
  }
}
