// Envuelve un controller async para que los errores lleguen al errorHandler
// sin tener que escribir try/catch en cada uno.

/** Envuelve un controller async: si lanza, el error va a next() (y de ahi al errorHandler). */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
