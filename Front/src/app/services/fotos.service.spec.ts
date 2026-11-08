import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { apiInterceptor } from '@app/interceptors/api.interceptor';
import { FirmaSubida, FotosService } from './fotos.service';

const firma: FirmaSubida = {
  timestamp: 1700000000,
  signature: 'firma-abc',
  publicId: 'parkit/vehiculos/v1/abc',
  allowedFormats: 'jpg,png,webp',
  urlSubida: '/fotos-locales',
};

describe('FotosService', () => {
  let servicio: FotosService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([apiInterceptor])), provideHttpClientTesting()],
    });
    servicio = TestBed.inject(FotosService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sube la imagen cruda a la API, con la firma en la query', () => {
    const archivo = new Blob(['x'], { type: 'image/webp' });
    let publicId: string | undefined;

    servicio.subir(archivo, firma).subscribe((id) => (publicId = id));

    const pedido = http.expectOne((req) => req.url === '/api/fotos-locales');
    expect(pedido.request.method).toBe('POST');
    expect(pedido.request.body).toBe(archivo);
    expect(pedido.request.headers.get('Content-Type')).toBe('image/webp');
    expect(pedido.request.params.get('public_id')).toBe('parkit/vehiculos/v1/abc');
    expect(pedido.request.params.get('timestamp')).toBe('1700000000');
    expect(pedido.request.params.get('signature')).toBe('firma-abc');

    pedido.flush({ public_id: 'parkit/vehiculos/v1/abc' });
    expect(publicId).toBe('parkit/vehiculos/v1/abc');
  });
});
