import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '@app/services/auth.service';
import { errorInterceptor } from './error.interceptor';

describe('errorInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let logout: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    logout = vi.fn(() => of(undefined));
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { estaAutenticado: () => true, logout } },
        { provide: Router, useValue: { navigate: vi.fn() } },
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it('un 401 de la API cierra la sesion', () => {
    http.get('/api/reservas').subscribe({ error: () => undefined });
    backend.expectOne('/api/reservas').flush({ error: { message: 'Token invalido' } }, { status: 401, statusText: 'x' });
    expect(logout).toHaveBeenCalled();
  });

  it('un error de Cloudinary no cierra la sesion y muestra un mensaje propio', () => {
    let mensaje = '';
    const url = 'https://api.cloudinary.com/v1_1/demo/image/upload';
    http.post(url, {}).subscribe({ error: (e: Error) => (mensaje = e.message) });
    backend.expectOne(url).flush({ error: { message: 'Invalid Signature abc. String to sign - x' } }, {
      status: 401,
      statusText: 'x',
    });

    expect(logout).not.toHaveBeenCalled();
    expect(mensaje).toBe('No pudimos subir la foto. Probá de nuevo en un rato.');
  });
});
