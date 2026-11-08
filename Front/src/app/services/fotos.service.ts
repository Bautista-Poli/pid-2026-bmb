import { HttpClient, HttpEventType } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, filter, map, tap } from 'rxjs';

/** Lo que devuelve la API (`.../firma`) para subir una foto. */
export interface FirmaSubida {
  timestamp: number;
  signature: string;
  /** El nombre que va a tener la foto: la firma solo sirve para este. */
  publicId: string;
  allowedFormats: string;
  /** Ruta de la API donde se sube (`/fotos-locales`). */
  urlSubida: string;
}

/**
 * Subida de fotos a la API, que las guarda en disco (Back/src/services/fotos.service.js).
 * La API firma el `public_id`; el navegador sube la imagen cruda con esa firma
 * y despues le manda a la API solo el `public_id` para asociarlo.
 */
@Injectable({ providedIn: 'root' })
export class FotosService {
  private readonly http = inject(HttpClient);

  /** Sube el archivo y devuelve su `public_id`. `alProgresar` recibe de 0 a 100. */
  subir(archivo: Blob, firma: FirmaSubida, alProgresar?: (porcentaje: number) => void): Observable<string> {
    const params = { public_id: firma.publicId, timestamp: firma.timestamp, signature: firma.signature };
    return this.http
      .post<{ public_id: string }>(firma.urlSubida, archivo, {
        params,
        headers: { 'Content-Type': archivo.type || 'image/jpeg' },
        reportProgress: true,
        observe: 'events',
      })
      .pipe(
        tap((evento) => {
          if (evento.type === HttpEventType.UploadProgress && evento.total) {
            alProgresar?.(Math.round((100 * evento.loaded) / evento.total));
          }
        }),
        filter((evento) => evento.type === HttpEventType.Response),
        map((evento) => evento.body!.public_id),
      );
  }
}
