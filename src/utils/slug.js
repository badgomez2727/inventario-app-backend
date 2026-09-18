// backend/src/utils/slug.js
//
// Normaliza un texto a un slug válido para la URL pública del catálogo
// (/catalogo/:slug): minúsculas, sin tildes/ñ especiales, solo letras,
// números y guiones.

const SLUG_VALIDO_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SLUG_MIN_LENGTH = 3;
const SLUG_MAX_LENGTH = 100;

const slugify = (texto) =>
  (texto || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // quita tildes
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '-')
    .replace(/^-+|-+$/g, '');

const esSlugValido = (slug) =>
  typeof slug === 'string' &&
  slug.length >= SLUG_MIN_LENGTH &&
  slug.length <= SLUG_MAX_LENGTH &&
  SLUG_VALIDO_REGEX.test(slug);

module.exports = { slugify, esSlugValido, SLUG_MIN_LENGTH, SLUG_MAX_LENGTH };
