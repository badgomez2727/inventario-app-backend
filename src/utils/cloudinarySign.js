// backend/src/utils/cloudinarySign.js
//
// Firma peticiones a Cloudinary con el algoritmo documentado públicamente
// (https://cloudinary.com/documentation/authentication_signatures), sin
// instalar el SDK oficial: la subida en sí va directo del navegador a
// Cloudinary (nuestro servidor nunca mueve el binario de la imagen), así
// que lo único que hace falta acá es poder firmar — un SHA-1 sobre los
// parámetros ordenados alfabéticamente más el API secret.
//
// Variables de entorno requeridas: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY,
// CLOUDINARY_API_SECRET (nunca se imprimen ni se devuelven al cliente).

const crypto = require('crypto');

const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;

const cloudinaryConfigurado = () =>
  Boolean(CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET);

// `params` es un objeto plano (sin `file`, `cloud_name` ni `api_key`, esos
// van aparte). Devuelve el string de firma en hex.
const signParams = (params) => {
  const paramString = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  return crypto
    .createHash('sha1')
    .update(paramString + CLOUDINARY_API_SECRET)
    .digest('hex');
};

// Firma para subir una imagen nueva: el navegador hace POST directo a
// https://api.cloudinary.com/v1_1/<cloud_name>/image/upload con estos campos
// más el archivo — Cloudinary valida que timestamp/folder coincidan con la firma.
const getUploadSignature = ({ folder }) => {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signParams({ folder, timestamp });
  return {
    signature,
    timestamp,
    apiKey: CLOUDINARY_API_KEY,
    cloudName: CLOUDINARY_CLOUD_NAME,
    folder,
  };
};

// Borra una imagen en Cloudinary por su public_id. A diferencia de la
// subida, esto sí lo hace nuestro backend (borrar requiere el api_secret,
// nunca debe viajar al navegador).
const destroyImage = async (publicId) => {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signParams({ public_id: publicId, timestamp });

  const body = new URLSearchParams({
    public_id: publicId,
    timestamp: String(timestamp),
    api_key: CLOUDINARY_API_KEY,
    signature,
  });

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/destroy`,
    { method: 'POST', body }
  );

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Cloudinary destroy falló (${response.status}): ${text}`);
  }
  return response.json();
};

module.exports = { cloudinaryConfigurado, getUploadSignature, destroyImage };
