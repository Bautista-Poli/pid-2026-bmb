import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

/** Lo que devuelve la API (`.../firma`) para subir una foto a una carpeta. */
export interface FirmaSubida {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  /** El nombre que va a tener la foto: la firma solo sirve para este. */
  publicId: string;
  allowedFormats: string;
}

/**
 * Subida directa del navegador a Cloudinary. La API firma (el secreto nunca
 * llega al front) y despues recibe solo el `public_id`: los bytes no pasan por
 * Express. La URL es absoluta, asi que el `apiInterceptor` no le antepone
 * `/api`, y no lleva credenciales: la cookie de sesion no sale del dominio.
 */
@Injectable({ providedIn: 'root' })
export class CloudinaryService {
  private readonly http = inject(HttpClient);

  /** Sube el archivo y devuelve su `public_id`. */
  subir(archivo: Blob, firma: FirmaSubida): Observable<string> {
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
      })
      .pipe(map(({ public_id }) => public_id));
  }
}
