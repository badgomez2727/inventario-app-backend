// backend/src/utils/text.js
//
// Normalización de texto para búsquedas tolerantes a mayúsculas, tildes y
// puntuación (usado por el matching del pedido por WhatsApp sin IA y por
// los buscadores de clientes/cartera).

const normalizeText = (str) =>
  (str || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // quita tildes
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Solo dígitos — para comparar celulares sin importar +57, espacios o
// guiones (el celular ya se guarda normalizado, pero lo que escribe quien
// busca puede venir en cualquier formato).
const onlyDigits = (str) => (str || '').replace(/\D/g, '');

module.exports = { normalizeText, onlyDigits };
