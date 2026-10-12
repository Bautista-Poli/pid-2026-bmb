import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { apiInterceptor } from '@app/interceptors/api.interceptor';
import { CloudinaryService, FirmaSubida } from './cloudinary.service';

const firma: FirmaSubida = {
  cloudName: 'demo',
  apiKey: '123',
  timestamp: 1700000000,
  signature: 'firma-abc',
  folder: 'parkit-dev/vehiculos/v1',
};

describe('CloudinaryService', () => {
  let servicio: CloudinaryService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([apiInterceptor])), provideHttpClientTesting()],
    });
    servicio = TestBed.inject(CloudinaryService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('sube directo a Cloudinary con la firma y devuelve el public_id', () => {
    const archivo = new Blob(['x'], { type: 'image/jpeg' });
    let publicId: string | undefined;

    servicio.subir(archivo, firma).subscribe((id) => (publicId = id));

    // El interceptor de la API no tiene que anteponerle /api a la URL absoluta.
    const pedido = http.expectOne('https://api.cloudinary.com/v1_1/demo/image/upload');
    expect(pedido.request.method).toBe('POST');
    expect(pedido.request.withCredentials).toBe(false);

    const cuerpo = pedido.request.body as FormData;
    expect(cuerpo.get('api_key')).toBe('123');
    expect(cuerpo.get('timestamp')).toBe('1700000000');
    expect(cuerpo.get('signature')).toBe('firma-abc');
    expect(cuerpo.get('folder')).toBe('parkit-dev/vehiculos/v1');
    expect(cuerpo.get('file')).toBeInstanceOf(Blob);

    pedido.flush({ public_id: 'parkit-dev/vehiculos/v1/abc' });
    expect(publicId).toBe('parkit-dev/vehiculos/v1/abc');
  });
});
