// Validacion minima y explicita, sin dependencias externas.
// Cada validador arma un Campos, encadena reglas y devuelve { valores, errores }.

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REGEX_HORA = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

export function campos(datos) {
  const valores = {};
  const errores = [];

  const fallar = (campo, mensaje) => {
    errores.push({ campo, mensaje });
    return api;
  };

  const vacio = (valor) => valor === undefined || valor === null || valor === '';

  /** Aplica una regla solo si el campo vino; si es obligatorio y falta, error. */
  const procesar = (campo, valor, { requerido = true, default: porDefecto } = {}, regla) => {
    if (vacio(valor)) {
      if (requerido) return fallar(campo, 'es obligatorio');
      if (porDefecto !== undefined) valores[campo] = porDefecto;
      return api;
    }
    return regla(valor);
  };

  const api = {
    texto(campo, valor, opciones = {}) {
      const { min = 1, max = 255 } = opciones;
      return procesar(campo, valor, opciones, (bruto) => {
        if (typeof bruto !== 'string') return fallar(campo, 'debe ser texto');
        const limpio = bruto.trim();
        if (limpio.length < min) return fallar(campo, `debe tener al menos ${min} caracteres`);
        if (limpio.length > max) return fallar(campo, `no puede superar los ${max} caracteres`);
        valores[campo] = limpio;
        return api;
      });
    },

    email(campo, valor, opciones = {}) {
      return procesar(campo, valor, opciones, (bruto) => {
        if (typeof bruto !== 'string') return fallar(campo, 'debe ser texto');
        const limpio = bruto.trim().toLowerCase();
        if (!REGEX_EMAIL.test(limpio)) return fallar(campo, 'no tiene formato de email');
        if (limpio.length > 160) return fallar(campo, 'no puede superar los 160 caracteres');
        valores[campo] = limpio;
        return api;
      });
    },

    enumerado(campo, valor, permitidos, opciones = {}) {
      return procesar(campo, valor, opciones, (bruto) => {
        const limpio = String(bruto).trim().toUpperCase();
        if (!permitidos.includes(limpio)) {
          return fallar(campo, `debe ser uno de: ${permitidos.join(', ')}`);
        }
        valores[campo] = limpio;
        return api;
      });
    },

    numero(campo, valor, opciones = {}) {
      const { min = -Infinity, max = Infinity, decimales } = opciones;
      return procesar(campo, valor, opciones, (bruto) => {
        const numero = Number(bruto);
        if (!Number.isFinite(numero)) return fallar(campo, 'debe ser un numero');
        // Montos: la base guarda 2 decimales y redondearia en silencio.
        if (decimales !== undefined) {
          const escalado = numero * 10 ** decimales;
          if (Math.abs(escalado - Math.round(escalado)) > 1e-9) {
            return fallar(campo, `admite hasta ${decimales} decimales`);
          }
        }
        if (numero < min) return fallar(campo, `no puede ser menor a ${min}`);
        if (numero > max) return fallar(campo, `no puede ser mayor a ${max}`);
        valores[campo] = numero;
        return api;
      });
    },

    entero(campo, valor, opciones = {}) {
      return procesar(campo, valor, opciones, (bruto) => {
        const numero = Number(bruto);
        if (!Number.isInteger(numero)) return fallar(campo, 'debe ser un numero entero');
        const { min = -Infinity, max = Infinity } = opciones;
        if (numero < min) return fallar(campo, `no puede ser menor a ${min}`);
        if (numero > max) return fallar(campo, `no puede ser mayor a ${max}`);
        valores[campo] = numero;
        return api;
      });
    },

    booleano(campo, valor, opciones = {}) {
      return procesar(campo, valor, opciones, (bruto) => {
        if (typeof bruto === 'boolean') {
          valores[campo] = bruto;
          return api;
        }
        if (bruto === 'true' || bruto === 'false') {
          valores[campo] = bruto === 'true';
          return api;
        }
        return fallar(campo, 'debe ser true o false');
      });
    },

    uuid(campo, valor, opciones = {}) {
      return procesar(campo, valor, opciones, (bruto) => {
        if (typeof bruto !== 'string' || !REGEX_UUID.test(bruto)) {
          return fallar(campo, 'debe ser un UUID valido');
        }
        valores[campo] = bruto;
        return api;
      });
    },

    hora(campo, valor, opciones = {}) {
      return procesar(campo, valor, opciones, (bruto) => {
        if (typeof bruto !== 'string' || !REGEX_HORA.test(bruto.trim())) {
          return fallar(campo, 'debe tener formato HH:MM');
        }
        valores[campo] = bruto.trim();
        return api;
      });
    },

    /** Fecha-hora ISO 8601. Guarda un Date para que pg lo mande como timestamptz. */
    fechaHora(campo, valor, opciones = {}) {
      return procesar(campo, valor, opciones, (bruto) => {
        const fecha = new Date(bruto);
        if (Number.isNaN(fecha.getTime())) {
          return fallar(campo, 'debe ser una fecha ISO 8601 valida (ej: 2026-09-10T14:00:00-03:00)');
        }
        valores[campo] = fecha;
        return api;
      });
    },

    /** Regla libre para validaciones que cruzan varios campos. */
    verificar(condicion, campo, mensaje) {
      if (!condicion) return fallar(campo, mensaje);
      return api;
    },

    resultado() {
      return { valores, errores };
    },
  };

  return api;
}
