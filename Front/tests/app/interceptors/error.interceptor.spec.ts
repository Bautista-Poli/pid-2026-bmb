import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '@app/services/auth.service';
import { ErrorApi, errorInterceptor } from '@app/interceptors/error.interceptor';

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

  it('un error de la API conserva los details', () => {
    let detalles: unknown = null;
    http.post('/api/x', {}).subscribe({ error: (e: ErrorApi) => (detalles = e.detalles) });
    backend
      .expectOne('/api/x')
      .flush({ error: { message: 'No', details: { reservas_sin_alternativa: ['r1'] } } }, { status: 409, statusText: 'x' });

    expect(detalles).toEqual({ reservas_sin_alternativa: ['r1'] });
  });
});
