import { HttpClient, HttpEventType } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, filter, map, tap } from 'rxjs';

/** Lo que devuelve la API (`.../firma`) para subir una foto a una carpeta. */
export interface FirmaSubida {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  /** El nombre que va a tener la foto: la firma solo sirve para este. */
  publicId: string;
  allowedFormats: string;
  /**
   * Solo en modo offline (OFFLINE=true en el back): la ruta de la API donde se
   * sube la foto en vez de Cloudinary. Ver Back/src/services/fotos-locales.service.js.
   */
  urlSubida?: string;
}

/**
 * Subida directa del navegador a Cloudinary (o a la API en modo offline). La API firma (el secreto nunca
 * llega al front) y despues recibe solo el `public_id`: los bytes no pasan por
 * Express. La URL es absoluta, asi que el `apiInterceptor` no le antepone
 * `/api`, y no lleva credenciales: la cookie de sesion no sale del dominio.
 */
@Injectable({ providedIn: 'root' })
export class CloudinaryService {
  private readonly http = inject(HttpClient);

  /** Sube el archivo y devuelve su `public_id`. `alProgresar` recibe de 0 a 100. */
  subir(archivo: Blob, firma: FirmaSubida, alProgresar?: (porcentaje: number) => void): Observable<string> {
    const pedido = firma.urlSubida ? this.pedidoLocal(archivo, firma) : this.pedidoCloudinary(archivo, firma);
    return pedido.pipe(
      tap((evento) => {
        if (evento.type === HttpEventType.UploadProgress && evento.total) {
          alProgresar?.(Math.round((100 * evento.loaded) / evento.total));
        }
      }),
      filter((evento) => evento.type === HttpEventType.Response),
      map((evento) => evento.body!.public_id),
    );
  }

  private pedidoCloudinary(archivo: Blob, firma: FirmaSubida) {
    const cuerpo = new FormData();
    cuerpo.append('file', archivo);
    cuerpo.append('api_key', firma.apiKey);
    cuerpo.append('timestamp', String(firma.timestamp));
    cuerpo.append('signature', firma.signature);
    cuerpo.append('public_id', firma.publicId);
    cuerpo.append('allowed_formats', firma.allowedFormats);

    return this.http
      .post<{ public_id: string }>(`https://api.cloudinary.com/v1_1/${firma.cloudName}/image/upload`, cuerpo, {
        withCredentials: false,
        reportProgress: true,
        observe: 'events',
      });
  }

  /** Modo offline: la imagen cruda a la API, con la firma en la query. */
  private pedidoLocal(archivo: Blob, firma: FirmaSubida) {
    const params = { public_id: firma.publicId, timestamp: firma.timestamp, signature: firma.signature };
    return this.http.post<{ public_id: string }>(firma.urlSubida!, archivo, {
      params,
      headers: { 'Content-Type': archivo.type || 'image/jpeg' },
      reportProgress: true,
      observe: 'events',
    });
  }
}
