// backend/src/controllers/productImageController.js
//
// Fotos de producto para el catálogo público (v1.2). La subida real va
// directo del navegador a Cloudinary con una firma que este controlador
// genera (getUploadSignature) — nuestro servidor nunca recibe el binario de
// la imagen. Después de subirla, el frontend registra la URL resultante acá
// (addProductImage). Borrar sí pasa por el backend (destroyImage necesita el
// api_secret, que nunca puede viajar al navegador).
//
// Mismo nivel de permiso que el resto de la edición de productos: cualquier
// usuario autenticado de la compañía (no solo admin) — así ya funciona hoy
// PUT /api/productos/:id.

const { PrismaClient } = require('@prisma/client');
const { cloudinaryConfigurado, getUploadSignature, destroyImage } = require('../utils/cloudinarySign');
const prisma = new PrismaClient();

const findOwnedProduct = async (productId, companyId) =>
  prisma.product.findFirst({ where: { id: productId, companyId } });

// POST /api/productos/:id/imagenes/firma
const getSignature = async (req, res) => {
  const companyId = req.companyId;
  const productId = parseInt(req.params.id, 10);

  if (!Number.isInteger(productId)) {
    return res.status(400).json({ error: 'Producto inválido.' });
  }

  try {
    const product = await findOwnedProduct(productId, companyId);
    if (!product) {
      return res.status(404).json({ error: 'Producto no encontrado o no pertenece a tu compañía.' });
    }

    if (!cloudinaryConfigurado()) {
      return res.status(503).json({ error: 'La subida de fotos no está configurada todavía (faltan las credenciales de Cloudinary).' });
    }

    const folder = `vendita/company_${companyId}/products/${productId}`;
    res.json(getUploadSignature({ folder }));
  } catch (error) {
    console.error('Error al generar la firma de subida:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

// POST /api/productos/:id/imagenes
// body: { url, publicId } — el resultado de la subida directa a Cloudinary.
const addImage = async (req, res) => {
  const companyId = req.companyId;
  const productId = parseInt(req.params.id, 10);
  const { url, publicId } = req.body;

  if (!Number.isInteger(productId)) {
    return res.status(400).json({ error: 'Producto inválido.' });
  }
  if (!url || !publicId) {
    return res.status(400).json({ error: 'Faltan datos de la imagen subida (url, publicId).' });
  }

  try {
    const product = await findOwnedProduct(productId, companyId);
    if (!product) {
      return res.status(404).json({ error: 'Producto no encontrado o no pertenece a tu compañía.' });
    }

    const ultima = await prisma.productImage.findFirst({
      where: { productId },
      orderBy: { orden: 'desc' },
    });

    const image = await prisma.productImage.create({
      data: { productId, url, publicId, orden: ultima ? ultima.orden + 1 : 0 },
    });

    res.status(201).json(image);
  } catch (error) {
    console.error('Error al registrar la imagen del producto:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

// DELETE /api/productos/:id/imagenes/:imageId
const deleteImage = async (req, res) => {
  const companyId = req.companyId;
  const productId = parseInt(req.params.id, 10);
  const imageId = parseInt(req.params.imageId, 10);

  if (!Number.isInteger(productId) || !Number.isInteger(imageId)) {
    return res.status(400).json({ error: 'Producto o imagen inválidos.' });
  }

  try {
    const product = await findOwnedProduct(productId, companyId);
    if (!product) {
      return res.status(404).json({ error: 'Producto no encontrado o no pertenece a tu compañía.' });
    }

    const image = await prisma.productImage.findFirst({ where: { id: imageId, productId } });
    if (!image) {
      return res.status(404).json({ error: 'Imagen no encontrada en este producto.' });
    }

    // Primero Cloudinary, luego la base de datos: si el borrado en Cloudinary
    // falla, mejor dejar el registro (se puede reintentar) que perder la
    // referencia y dejar la imagen huérfana allá pagando almacenamiento.
    if (cloudinaryConfigurado()) {
      await destroyImage(image.publicId);
    }
    await prisma.productImage.delete({ where: { id: imageId } });

    res.status(204).send();
  } catch (error) {
    console.error('Error al eliminar la imagen del producto:', error);
    res.status(500).json({ error: 'Error interno del servidor al eliminar la imagen.' });
  }
};

// PATCH /api/productos/:id/imagenes/orden
// body: { ids: [idFoto1, idFoto2, ...] } en el orden deseado (la primera es
// la portada).
const reorderImages = async (req, res) => {
  const companyId = req.companyId;
  const productId = parseInt(req.params.id, 10);
  const { ids } = req.body;

  if (!Number.isInteger(productId)) {
    return res.status(400).json({ error: 'Producto inválido.' });
  }
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Debes indicar el orden como una lista de ids.' });
  }

  try {
    const product = await findOwnedProduct(productId, companyId);
    if (!product) {
      return res.status(404).json({ error: 'Producto no encontrado o no pertenece a tu compañía.' });
    }

    const imagenesDelProducto = await prisma.productImage.findMany({ where: { productId } });
    const idsValidos = new Set(imagenesDelProducto.map((img) => img.id));
    const todosValidos = ids.every((id) => idsValidos.has(id)) && ids.length === imagenesDelProducto.length;
    if (!todosValidos) {
      return res.status(400).json({ error: 'La lista de ids no coincide con las imágenes de este producto.' });
    }

    await prisma.$transaction(
      ids.map((id, index) => prisma.productImage.update({ where: { id }, data: { orden: index } }))
    );

    const actualizadas = await prisma.productImage.findMany({ where: { productId }, orderBy: { orden: 'asc' } });
    res.json(actualizadas);
  } catch (error) {
    console.error('Error al reordenar las imágenes del producto:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

module.exports = { getSignature, addImage, deleteImage, reorderImages };
