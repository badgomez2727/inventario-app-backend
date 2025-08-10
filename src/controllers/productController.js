// venta_inventario_app/backend/src/controllers/productController.js

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const getProducts = async (req, res) => {
  const companyId = req.companyId;
  try {
    const products = await prisma.product.findMany({
      where: {
        companyId,
      },
      include: {
        supplier: true, // <-- Incluimos la información del proveedor
      },
    });
    res.json(products);
  } catch (error) {
    console.error('Error al obtener productos:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

const createProduct = async (req, res) => {
  const { nombre, descripcion, sku, precioCompra, precioVenta, unidadMedida, categoria, imagenUrl, supplierId } = req.body;
  const companyId = req.companyId;

  if (!nombre || !sku || !precioCompra || !precioVenta || !supplierId) {
    return res.status(400).json({ error: 'Faltan campos obligatorios: nombre, sku, precioCompra, precioVenta y supplierId.' });
  }

  try {
    const newProduct = await prisma.product.create({
      data: {
        companyId,
        nombre,
        descripcion,
        sku,
        precioCompra: parseFloat(precioCompra),
        precioVenta: parseFloat(precioVenta),
        unidadMedida,
        categoria,
        imagenUrl,
        supplierId: parseInt(supplierId), // <-- Guardamos el ID del proveedor
      },
    });
    res.status(201).json(newProduct);
  } catch (error) {
    console.error('Error al crear producto:', error);
    if (error.code === 'P2002' && error.meta.target.includes('sku')) {
      return res.status(409).json({ error: 'El SKU ya existe para esta compañía.' });
    }
    res.status(500).json({ error: 'Error interno del servidor al crear el producto.' });
  }
};

const updateProduct = async (req, res) => {
  const { id } = req.params;
  const { nombre, sku, precioCompra, precioVenta, unidadMedida, categoria, supplierId } = req.body;
  const companyId = req.companyId;

  if (!nombre || !sku || !precioCompra || !precioVenta || !unidadMedida || !categoria || !supplierId) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
  }

  try {
    const updatedProduct = await prisma.product.update({
      where: {
        id: parseInt(id),
        companyId,
      },
      data: {
        nombre,
        sku,
        precioCompra: parseFloat(precioCompra),
        precioVenta: parseFloat(precioVenta),
        unidadMedida,
        categoria,
        supplierId: parseInt(supplierId), // <-- Actualizamos el ID del proveedor
      },
    });

    res.json(updatedProduct);
  } catch (error) {
    console.error('Error al actualizar el producto:', error);
    res.status(500).json({ error: 'Error al actualizar el producto.' });
  }
};

module.exports = {
  createProduct,
  getProducts,
  updateProduct,
};