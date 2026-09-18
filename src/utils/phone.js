// backend/src/utils/phone.js
//
// Normaliza celulares al formato internacional colombiano (+57XXXXXXXXXX).
// Se usa como identificador de cliente: dos clientes con el mismo celular
// normalizado en la misma compañía se tratan como el mismo cliente (ver
// findOrCreateCliente en clienteController.js), sin importar cómo lo haya
// escrito quien lo tecleó (con espacios, guiones, con o sin +57, etc.).

// Celular colombiano válido: 10 dígitos que empiezan en 3 (rango de
// operadores móviles). No cubre fijos ni otros países a propósito — es lo
// que de verdad se usa para WhatsApp/contacto en el negocio.
const CELULAR_CO_REGEX = /^3\d{9}$/;

// Devuelve el celular en formato "+57XXXXXXXXXX", o null si no es un
// celular colombiano válido reconocible.
const normalizePhoneCO = (raw) => {
  if (!raw || typeof raw !== 'string') return null;

  const soloDigitosYMas = raw.replace(/[^\d+]/g, '');

  let core;
  if (soloDigitosYMas.startsWith('+57')) {
    core = soloDigitosYMas.slice(3);
  } else if (soloDigitosYMas.startsWith('57') && soloDigitosYMas.length === 12) {
    core = soloDigitosYMas.slice(2);
  } else if (soloDigitosYMas.startsWith('+')) {
    // Algún otro código de país explícito — no lo soportamos, mejor
    // rechazar con claridad que adivinar mal.
    return null;
  } else {
    core = soloDigitosYMas;
  }

  if (!CELULAR_CO_REGEX.test(core)) return null;
  return `+57${core}`;
};

module.exports = { normalizePhoneCO };
