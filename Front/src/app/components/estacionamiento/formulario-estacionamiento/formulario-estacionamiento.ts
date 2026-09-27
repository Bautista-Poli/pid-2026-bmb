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
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Observable, catchError, map, of } from 'rxjs';
import { Boton, CampoAutocompletar, Sugerencia, Tarjeta } from '@app/components/ui';
import { FotoEstacionamiento } from '../foto-estacionamiento/foto-estacionamiento';
import { DiaSemana, Direccion, Estacionamiento, NuevoEstacionamiento } from '@app/models';
import {
  GeorefService,
  LugarGeoref,
  filtrarLugares,
  normalizar,
} from '@app/services/georef.service';

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
  imports: [ReactiveFormsModule, RouterLink, Boton, CampoAutocompletar, FotoEstacionamiento, Tarjeta],
  templateUrl: './formulario-estacionamiento.html',
})
export class FormularioEstacionamiento {
  private readonly fb = inject(FormBuilder);
  private readonly georef = inject(GeorefService);

  /** Estacionamiento a editar. `null` (el default) es el modo alta. */
  readonly estacionamiento = input<Estacionamiento | null>(null);
  readonly enviando = input(false);
  readonly error = input<string | null>(null);
  readonly textoEnviar = input('Guardar');

  readonly guardar = output<NuevoEstacionamiento>();
  /**
   * Se emite junto con `guardar`, en el mismo `enviar()`, solo si el
   * propietario toco la foto: `null` para sacarla, o el archivo elegido.
   * Va aparte porque subirla es un request distinto (multipart/binario) y
   * porque en el alta recien se puede mandar despues del POST, cuando el
   * estacionamiento ya tiene id.
   */
  readonly fotoElegida = output<File | null>();

  protected readonly dias = DIAS;

  /**
   * `undefined` = no se toco la foto, `null` = se pidio quitarla, `File` = se
   * elige una nueva. Quien usa el formulario decide como subirla: necesita el
   * id del estacionamiento, que en el alta recien existe despues de crearlo.
   */
  protected readonly archivoFoto = signal<File | null | undefined>(undefined);

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
  // Provincia, ciudad y calle salen de Georef (la API oficial de direcciones):
  // cada una se elige de una lista y depende de la anterior, asi no se puede
  // cargar una ciudad o una calle inventada. El backend lo vuelve a validar.

  protected readonly errorProvincias = signal(false);
  protected readonly provincias = toSignal(
    this.georef.provincias$.pipe(
      catchError(() => {
        this.errorProvincias.set(true);
        return of([] as LugarGeoref[]);
      }),
    ),
    { initialValue: [] as LugarGeoref[] },
  );

  private readonly provinciaElegida = toSignal(this.formulario.controls.provincia.valueChanges, {
    initialValue: '',
  });
  private readonly provinciaId = computed(
    () => this.provincias().find((p) => p.nombre === this.provinciaElegida())?.id ?? null,
  );
  /** Id de Georef de la ciudad elegida: con el se buscan sus calles. */
  private readonly ciudadId = signal<string | null>(null);

  /** La direccion guardada no coincide con Georef (cargada antes de este cambio). */
  protected readonly direccionDesactualizada = signal(false);

  protected readonly buscarCiudades = (texto: string): Observable<Sugerencia[]> => {
    const provinciaId = this.provinciaId();
    if (!provinciaId) return of([]);
    return this.georef.ciudadesDe(provinciaId).pipe(
      map((ciudades) =>
        filtrarLugares(ciudades, texto).map((c) => ({
          nombre: c.nombre,
          detalle: c.detalle,
          dato: c.id,
        })),
      ),
    );
  };

  protected readonly buscarCalles = (texto: string): Observable<Sugerencia[]> => {
    const ciudadId = this.ciudadId();
    if (!ciudadId) return of([]);
    return this.georef
      .callesDe(ciudadId)
      .pipe(map((calles) => filtrarLugares(calles, texto).map((c) => ({ nombre: c.nombre }))));
  };

  protected elegirCiudad(sugerencia: Sugerencia): void {
    const ciudadId = sugerencia.dato as string;
    this.ciudadId.set(ciudadId);
    // Se piden las calles ya, asi estan listas cuando empiecen a escribir.
    this.georef.callesDe(ciudadId);
  }

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
      this.ciudadId.set(null);
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

    // Al editar, se confirma que la direccion guardada exista en Georef y se
    // busca el id de su ciudad (hace falta para buscar calles). Si no existe
    // (se cargo antes de este cambio), se vacia para que la elijan de la lista.
    effect(() => {
      const estacionamiento = this.estacionamiento();
      const provincias = this.provincias();
      if (!estacionamiento || provincias.length === 0) return;
      untracked(() => this.verificarDireccionGuardada(estacionamiento.direccion, provincias));
    });
  }

  /**
   * Si la provincia tiene una sola ciudad (CABA: "Ciudad Autonoma de Buenos
   * Aires", que nadie busca por ese nombre) se completa sola. No pisa una
   * ciudad ya cargada, como la que precarga el editor.
   */
  private elegirCiudadUnica(provinciaNombre: string): void {
    const provincia = this.provincias().find((p) => p.nombre === provinciaNombre);
    if (!provincia) return;

    const { provincia: controlProvincia, ciudad } = this.formulario.controls;
    this.georef
      .ciudadesDe(provincia.id)
      .pipe(catchError(() => of([] as LugarGeoref[])))
      .subscribe((ciudades) => {
        const [unica] = ciudades;
        if (ciudades.length !== 1 || ciudad.value || controlProvincia.value !== provinciaNombre) {
          return;
        }
        ciudad.setValue(unica.nombre);
        this.elegirCiudad({ nombre: unica.nombre, dato: unica.id });
      });
  }

  private verificarDireccionGuardada(direccion: Direccion, provincias: LugarGeoref[]): void {
    const { provincia, ciudad } = this.formulario.controls;
    const desactualizada = () => {
      this.direccionDesactualizada.set(true);
      provincia.markAsTouched();
      ciudad.markAsTouched();
    };

    const provinciaGuardada = provincias.find((p) => p.nombre === direccion.provincia);
    if (!provinciaGuardada) {
      provincia.setValue('');
      desactualizada();
      return;
    }

    const buscada = normalizar(direccion.ciudad);
    this.georef
      .ciudadesDe(provinciaGuardada.id)
      .pipe(
        map((ciudades) => ciudades.find((c) => normalizar(c.nombre) === buscada) ?? null),
        catchError(() => of(undefined)),
      )
      .subscribe((encontrada) => {
        // `undefined`: Georef no respondio. Se deja como esta: el backend valida al guardar.
        if (encontrada === undefined) return;
        if (encontrada) {
          this.ciudadId.set(encontrada.id);
          this.georef.callesDe(encontrada.id);
        } else {
          ciudad.setValue('');
          desactualizada();
          this.elegirCiudadUnica(provinciaGuardada.nombre);
        }
      });
  }

  protected elegirFoto(archivo: File | null): void {
    this.archivoFoto.set(archivo);
  }

  protected invalido(campo: string): boolean {
    const control = this.formulario.get(campo);
    return Boolean(control?.invalid && control.touched);
  }

  protected enviar(): void {
    if (this.formulario.invalid) {
      this.formulario.markAllAsTouched();
      return;
    }

    const valores = this.formulario.getRawValue();
    const foto = this.archivoFoto();
    if (foto !== undefined) this.fotoElegida.emit(foto);

    this.guardar.emit({
      nombre: valores.nombre.trim(),
      descripcion: valores.descripcion.trim(),
      direccion: {
        calle: valores.calle.trim(),
        numero: valores.numero.trim(),
        ciudad: valores.ciudad.trim(),
        provincia: valores.provincia.trim(),
        codigoPostal: valores.codigoPostal.trim(),
        // El formulario no pide coordenadas: las que ya estaban se conservan.
        latitud: this.estacionamiento()?.direccion.latitud ?? null,
        longitud: this.estacionamiento()?.direccion.longitud ?? null,
      },
      barrioZona: valores.barrioZona.trim() || null,
      telefonoContacto: valores.telefono.trim() || null,
      emailContacto: valores.email.trim() || null,
      tarifas: {
        hora: valores.tarifaHora,
        estadia: valores.tarifaEstadia,
        jornada: valores.tarifaJornada,
      },
      cubierto: valores.cubierto,
      // La publicacion se maneja aparte, desde la pantalla de edicion.
      publicado: this.estacionamiento()?.publicado ?? true,
      horarios: valores.horarios
        .filter((horario) => horario.abierto)
        .map(({ dia, desde, hasta }) => ({ dia, desde, hasta })),
    });
  }
}
