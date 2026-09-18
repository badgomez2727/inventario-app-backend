// backend/src/controllers/companySettingsController.js
//
// Configuración de la PROPIA compañía para el catálogo público (v1.2):
// slug, activar/desactivar la vitrina, descripción y foto de portada,
// números de WhatsApp de venta, y si ofrece domicilio (con su valor por
// defecto). Solo admin_compania — distinto de adminController.js, que es
// el panel del super_admin_sistema sobre TODAS las compañías.

const { PrismaClient } = require('@prisma/client');
const { slugify, esSlugValido, SLUG_MIN_LENGTH } = require('../utils/slug');
const { normalizePhoneCO } = require('../utils/phone');
const { cloudinaryConfigurado, getUploadSignature } = require('../utils/cloudinarySign');
const prisma = new PrismaClient();

const SETTINGS_SELECT = {
  id: true,
  nombre: true,
  slug: true,
  catalogoPublicoActivo: true,
  descripcionCatalogo: true,
  fotoPortadaCatalogo: true,
  whatsappVentas: true,
  ofreceDomicilio: true,
  valorDomicilioDefault: true,
};

// GET /api/mi-compania
const getMiCompania = async (req, res) => {
  try {
    const company = await prisma.company.findUnique({
      where: { id: req.companyId },
      select: SETTINGS_SELECT,
    });
    res.json(company);
  } catch (error) {
    console.error('Error al obtener la configuración de la compañía:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

// PATCH /api/mi-compania
const updateMiCompania = async (req, res) => {
  const companyId = req.companyId;
  const { slug, catalogoPublicoActivo, descripcionCatalogo, fotoPortadaCatalogo, whatsappVentas, ofreceDomicilio, valorDomicilioDefault } = req.body;

  const data = {};

  try {
    const actual = await prisma.company.findUnique({ where: { id: companyId }, select: SETTINGS_SELECT });

    if (slug !== undefined) {
      const slugNormalizado = slugify(slug);
      if (!esSlugValido(slugNormalizado)) {
        return res.status(400).json({ error: `El identificador del catálogo debe tener al menos ${SLUG_MIN_LENGTH} letras/números (sin espacios ni símbolos, ej. "tienda-la-esquina").` });
      }
      const enUso = await prisma.company.findFirst({ where: { slug: slugNormalizado, id: { not: companyId } } });
      if (enUso) {
        return res.status(409).json({ error: 'Ese identificador ya lo está usando otra compañía. Elige otro.' });
      }
      data.slug = slugNormalizado;
    }

    if (whatsappVentas !== undefined) {
      if (!Array.isArray(whatsappVentas)) {
        return res.status(400).json({ error: 'whatsappVentas debe ser una lista de números.' });
      }
      const normalizados = [];
      for (const numero of whatsappVentas) {
        const normalizado = normalizePhoneCO(numero);
        if (!normalizado) {
          return res.status(400).json({ error: `Número de WhatsApp inválido: "${numero}". Usa un celular colombiano de 10 dígitos (ej. 3001234567).` });
        }
        if (!normalizados.includes(normalizado)) normalizados.push(normalizado);
      }
      data.whatsappVentas = normalizados;
    }

    if (ofreceDomicilio !== undefined) data.ofreceDomicilio = Boolean(ofreceDomicilio);

    if (valorDomicilioDefault !== undefined) {
      if (valorDomicilioDefault === null || valorDomicilioDefault === '') {
        data.valorDomicilioDefault = null;
      } else {
        const valor = Number(valorDomicilioDefault);
        if (!Number.isFinite(valor) || valor < 0) {
          return res.status(400).json({ error: 'El valor del domicilio debe ser un número mayor o igual a cero.' });
        }
        data.valorDomicilioDefault = valor;
      }
    }

    if (descripcionCatalogo !== undefined) data.descripcionCatalogo = descripcionCatalogo || null;
    if (fotoPortadaCatalogo !== undefined) data.fotoPortadaCatalogo = fotoPortadaCatalogo || null;

    if (catalogoPublicoActivo !== undefined) {
      const activando = Boolean(catalogoPublicoActivo);
      if (activando) {
        const slugFinal = data.slug ?? actual.slug;
        const whatsappFinal = data.whatsappVentas ?? actual.whatsappVentas;
        if (!slugFinal) {
          return res.status(400).json({ error: 'Configura primero el identificador del catálogo (slug) antes de activarlo.' });
        }
        if (!whatsappFinal || whatsappFinal.length === 0) {
          return res.status(400).json({ error: 'Agrega al menos un número de WhatsApp de ventas antes de activar el catálogo — si no, no hay a dónde llegue el pedido.' });
        }
      }
      data.catalogoPublicoActivo = activando;
    }

    const updated = await prisma.company.update({ where: { id: companyId }, data, select: SETTINGS_SELECT });
    res.json(updated);
  } catch (error) {
    console.error('Error al actualizar la configuración de la compañía:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

// POST /api/mi-compania/portada/firma — firma de subida para la foto de
// portada del catálogo (mismo mecanismo que las fotos de producto, ver
// productImageController.js: el backend firma, la subida va directo al
// navegador -> Cloudinary).
const getPortadaSignature = async (req, res) => {
  if (!cloudinaryConfigurado()) {
    return res.status(503).json({ error: 'La subida de fotos no está configurada todavía (faltan las credenciales de Cloudinary).' });
  }
  const folder = `vendita/company_${req.companyId}/catalog`;
  res.json(getUploadSignature({ folder }));
};

module.exports = { getMiCompania, updateMiCompania, getPortadaSignature };
