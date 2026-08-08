// venta_inventario_app/backend/src/controllers/productController.js

const { PrismaClient } = require('@prisma/client');
const { getPlanLimits } = require('../config/plans');
const prisma = new PrismaClient();

// Función para obtener todos los productos de la compañía del usuario
const getProducts = async (req, res) => {
  try {
    // CAMBIO CLAVE: Quitamos el ".user" porque tu middleware lo guarda directo en req
    const companyId = parseInt(req.companyId); 
    
    if (!companyId) {
      console.error("DEBUG: req.companyId llegó vacío:", req.companyId);
      return res.status(400).json({ error: "No se identificó la compañía" });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const [products, totalCount] = await Promise.all([
      prisma.product.findMany({
        where: { companyId: companyId },
        skip: skip,
        take: limit,
        orderBy: { nombre: 'asc' }
      }),
      prisma.product.count({ 
        where: { companyId: companyId } 
      })
    ]);

    res.json({
      products,
      totalPages: Math.ceil(totalCount / limit),
      currentPage: page,
      totalCount
    });

  } catch (error) {
    console.error("Error en getProducts:", error.message);
    res.status(500).json({ error: "Error interno del servidor" });
  }
};

// Función para crear un nuevo producto
const createProduct = async (req, res) => {
  const { nombre, descripcion, sku, precioCompra, precioVenta, stockActual, unidadMedida, categoria, imagenUrl, supplierId } = req.body;
  const companyId = req.companyId;

  // Validación y conversión de tipos
  const parsedPrecioCompra = parseFloat(precioCompra);
  const parsedPrecioVenta = parseFloat(precioVenta);
  const parsedStockActual = parseInt(stockActual, 10);

  if (!nombre || !sku || isNaN(parsedPrecioCompra) || isNaN(parsedPrecioVenta) || isNaN(parsedStockActual) || !unidadMedida || !categoria) {
    return res.status(400).json({ error: 'Faltan campos obligatorios o tienen formato inválido (nombre, sku, precioCompra, precioVenta, stockActual, unidadMedida, categoria).' });
  }

  try {
    const newProduct = await prisma.product.create({
      data: {
        companyId,
        nombre,
        descripcion,
        sku,
        precioCompra: parsedPrecioCompra,
        precioVenta: parsedPrecioVenta,
        stockActual: parsedStockActual,
        unidadMedida,
        categoria,
        imagenUrl,
        supplierId: supplierId ? parseInt(supplierId, 10) : null,
      },
    });
    res.status(201).json(newProduct);
  } catch (error) {
    console.error('Error al crear producto:', error);
    if (error.code === 'P2002') { // Código de error de Prisma para violación de unicidad
      return res.status(409).json({ error: 'Ya existe un producto con el mismo SKU en esta compañía.' });
    }
    res.status(500).json({ error: 'Error interno del servidor al crear el producto.' });
  }
};

// Función para actualizar un producto existente
const updateProduct = async (req, res) => {
  const { id } = req.params;
  const { nombre, descripcion, sku, precioCompra, precioVenta, stockActual, unidadMedida, categoria, imagenUrl, supplierId } = req.body;
  const companyId = req.companyId;

  // --- VALIDACIÓN Y CONVERSIÓN DE TIPOS PARA LA ACTUALIZACIÓN ---
  // Es crucial parsear y validar que son números válidos antes de pasarlos a Prisma
  const parsedPrecioCompra = parseFloat(precioCompra);
  const parsedPrecioVenta = parseFloat(precioVenta);
  const parsedStockActual = parseInt(stockActual, 10);

  // Validaciones: Aseguramos que los campos obligatorios y numéricos estén presentes y sean válidos
  if (!nombre || !sku || isNaN(parsedPrecioCompra) || isNaN(parsedPrecioVenta) || isNaN(parsedStockActual) || !unidadMedida || !categoria) {
    return res.status(400).json({ error: 'Faltan campos obligatorios o tienen formato inválido (nombre, sku, precioCompra, precioVenta, stockActual, unidadMedida, categoria).' });
  }

  try {
    const updatedProduct = await prisma.product.update({
      where: { id: parseInt(id), companyId: companyId }, // Aseguramos que solo pueda actualizar sus productos
      data: {
        nombre,
        descripcion,
        sku,
        precioCompra: parsedPrecioCompra, // Usar el valor parseado y validado
        precioVenta: parsedPrecioVenta,   // Usar el valor parseado y validado
        stockActual: parsedStockActual,   // Usar el valor parseado y validado
        unidadMedida,
        categoria,
        imagenUrl,
        supplierId: supplierId ? parseInt(supplierId, 10) : null,
      },
    });
    res.json(updatedProduct);
  } catch (error) {
    console.error('Error al actualizar producto:', error);
    if (error.code === 'P2025') { // Código de error de Prisma para registro no encontrado
      return res.status(404).json({ error: 'Producto no encontrado o no pertenece a tu compañía.' });
    }
    if (error.code === 'P2002') { // Código de error de Prisma para violación de unicidad
      return res.status(409).json({ error: 'Ya existe un producto con el mismo SKU en esta compañía.' });
    }
    res.status(500).json({ error: 'Error interno del servidor al actualizar el producto.' });
  }
};

// Función para eliminar un producto
const deleteProduct = async (req, res) => {
  const { id } = req.params;
  const companyId = req.companyId;

  try {
    await prisma.product.delete({
      where: { id: parseInt(id), companyId: companyId }, // Aseguramos que solo pueda eliminar sus productos
    });
    res.status(204).send(); // No Content
  } catch (error) {
    console.error('Error al eliminar producto:', error);
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Producto no encontrado o no pertenece a tu compañía.' });
    }
    res.status(500).json({ error: 'Error interno del servidor al eliminar el producto.' });
  }
};


// NUEVA FUNCIÓN PARA LA CARGA MASIVA DE PRODUCTOS DESDE CSV
const uploadProductsFromCsv = async (req, res) => {
  const companyId = req.companyId;
  const productsData = req.body; // Esperamos un array de objetos producto desde el frontend

  const results = {
    success: [],
    errors: []
  };

  // Respetar el límite del plan también en la carga masiva: sin esto, una
  // sola carga de CSV podría saltarse por completo el techo de productos.
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { plan: true } });
  const limits = getPlanLimits(company?.plan);
  let remainingSlots = limits.maxProducts === Infinity
    ? Infinity
    : limits.maxProducts - await prisma.product.count({ where: { companyId } });

  // Recorremos cada producto recibido del CSV
  for (const product of productsData) {
    if (remainingSlots <= 0) {
      results.errors.push({
        rowData: product,
        error: `No se procesó: alcanzaste el límite de ${limits.maxProducts} productos del plan ${limits.label}.`,
      });
      continue;
    }
    try {
      // 1. Validación de campos obligatorios
      if (!product.nombre || !product.sku || product.precioCompra == null || product.precioVenta == null || product.stockActual == null || !product.unidadMedida || !product.categoria) {
        results.errors.push({ rowData: product, error: 'Faltan campos obligatorios (nombre, sku, precioCompra, precioVenta, stockActual, unidadMedida, categoria).' });
        continue; // Pasar al siguiente producto
      }

      // 2. Conversión de tipos de datos
      const precioCompra = parseFloat(product.precioCompra);
      const precioVenta = parseFloat(product.precioVenta);
      const stockActual = parseInt(product.stockActual, 10);

      if (isNaN(precioCompra) || isNaN(precioVenta) || isNaN(stockActual)) {
        results.errors.push({ rowData: product, error: 'Valores numéricos inválidos para precioCompra, precioVenta o stockActual.' });
        continue;
      }

      // 3. Manejo del proveedor: buscar existente o crear uno nuevo
      let supplierId = null;
      if (product.supplierName) { // Asumimos que el CSV trae 'supplierName'
        let supplier = await prisma.supplier.findUnique({
          where: {
            nombre_companyId: { // Busca por el constraint de unicidad
              nombre: product.supplierName,
              companyId: companyId
            }
          }
        });

        if (!supplier) {
          // Si el proveedor no existe, lo creamos
          supplier = await prisma.supplier.create({
            data: {
              nombre: product.supplierName,
              companyId: companyId,
              contacto: product.supplierContacto || null, // Puedes añadir más campos si el CSV los tiene
              telefono: product.supplierTelefono || null,
              direccion: product.supplierDireccion || null,
            }
          });
        }
        supplierId = supplier.id;
      }

      // 4. Creación del producto en la base de datos
      const createdProduct = await prisma.product.create({
        data: {
          companyId: companyId,
          nombre: product.nombre,
          descripcion: product.descripcion || null,
          sku: product.sku,
          precioCompra: precioCompra,
          precioVenta: precioVenta,
          stockActual: stockActual,
          unidadMedida: product.unidadMedida,
          categoria: product.categoria,
          imagenUrl: product.imagenUrl || null,
          supplierId: supplierId,
          activo: true, // Por defecto, el producto está activo
        }
      });
      results.success.push(createdProduct); // Añadir a la lista de éxitos
      remainingSlots--;

    } catch (err) {
      console.error('Error al procesar fila de producto en carga masiva:', product, err);
      // Manejo de errores específicos de Prisma (ej. SKU duplicado)
      if (err.code === 'P2002') {
        results.errors.push({ rowData: product, error: `SKU '${product.sku}' ya existe para esta compañía. Producto duplicado.` });
      } else {
        results.errors.push({ rowData: product, error: `Error desconocido: ${err.message}` });
      }
    }
  }

  // 5. Enviar respuesta final
  if (results.errors.length > 0) {
    // Si hay errores, respondemos con Multi-Status (207) para indicar éxito parcial
    res.status(207).json({
      message: `Carga masiva completada: ${results.success.length} productos cargados con éxito, ${results.errors.length} con errores.`,
      successCount: results.success.length,
      errorCount: results.errors.length,
      errors: results.errors,
      successfulProducts: results.success,
    });
  } else {
    // Si no hay errores, respondemos con éxito (200)
    res.status(200).json({
      message: 'Carga masiva de productos completada con éxito.',
      successCount: results.success.length,
      successfulProducts: results.success,
    });
  }
};


module.exports = {
  getProducts,
  createProduct,
  updateProduct, // <-- Función corregida
  deleteProduct, 
  uploadProductsFromCsv,
};
