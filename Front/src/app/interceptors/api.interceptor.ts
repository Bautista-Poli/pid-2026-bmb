import { HttpInterceptorFn } from '@angular/common/http';

/**
 * Prefijo de la API de Express (Back/src/config/env.js -> apiPrefix). En
 * desarrollo lo redirige el proxy (proxy.conf.json) hacia localhost:3000; en
 * produccion el front se sirve desde el mismo origen que la API.
 */
const PREFIJO_API = '/api';

/**
 * Antepone la URL base de la API a todo request relativo, para que los
 * servicios escriban `this.http.get('/reservas')` y no repitan el prefijo.
 */
export const apiInterceptor: HttpInterceptorFn = (req, next) => {
  if (/^https?:\/\//i.test(req.url)) {
    return next(req);
  }

  const path = req.url.startsWith('/') ? req.url : `/${req.url}`;
  return next(req.clone({ url: `${PREFIJO_API}${path}` }));
};
