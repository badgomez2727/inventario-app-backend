// venta_inventario_app/backend/src/controllers/productController.js

const { PrismaClient } = require('@prisma/client');
const { getPlanLimits, getEffectivePlanName } = require('../config/plans');
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

    // Los productos inactivos (retirados: ver setProductActivo) no salen por
    // defecto — así desaparecen solos de ventas, alertas de stock y demás
    // pantallas que cargan esta lista. Solo el inventario los pide aparte.
    const where = req.query.incluirInactivos === 'true'
      ? { companyId }
      : { companyId, activo: true };

    const [products, totalCount] = await Promise.all([
      prisma.product.findMany({
        where,
        skip: skip,
        take: limit,
        orderBy: { nombre: 'asc' },
        include: { images: { orderBy: { orden: 'asc' } } },
      }),
      prisma.product.count({ where })
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
  const { nombre, descripcion, sku, precioCompra, precioVenta, stockActual, unidadMedida, categoria, imagenUrl, supplierId, visibleEnCatalogo } = req.body;
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
        visibleEnCatalogo: Boolean(visibleEnCatalogo),
      },
    });
    res.status(201).json(newProduct);
  } catch (error) {
    console.error('Error al crear producto:', error);
    if (error.code === 'P2002') { // Código de error de Prisma para violación de unicidad
      // El SKU sigue ocupado aunque el producto esté inactivo: hay que decirlo,
      // porque en la lista normal no se ve y parecería un error sin sentido.
      const existente = await prisma.product.findFirst({ where: { companyId, sku }, select: { activo: true } });
      if (existente && !existente.activo) {
        return res.status(409).json({ error: 'Ya existe un producto inactivo con ese SKU. Reactívalo desde Inventario (opción "Mostrar inactivos") o usa otro SKU.' });
      }
      return res.status(409).json({ error: 'Ya existe un producto con el mismo SKU en esta compañía.' });
    }
    res.status(500).json({ error: 'Error interno del servidor al crear el producto.' });
  }
};

// Función para actualizar un producto existente
const updateProduct = async (req, res) => {
  const { id } = req.params;
  const { nombre, descripcion, sku, precioCompra, precioVenta, stockActual, unidadMedida, categoria, imagenUrl, supplierId, visibleEnCatalogo } = req.body;
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

  const userId = req.userId;
  const productId = parseInt(id, 10);
  const newSupplierId = supplierId ? parseInt(supplierId, 10) : null;

  try {
    // 1. Traer el producto tal como está ANTES de tocarlo, para poder comparar
    //    campo por campo y saber qué cambió realmente.
    const existingProduct = await prisma.product.findFirst({
      where: { id: productId, companyId: companyId },
    });

    if (!existingProduct) {
      return res.status(404).json({ error: 'Producto no encontrado o no pertenece a tu compañía.' });
    }

    // 2. Comparar valores viejos vs nuevos y armar los registros de historial
    //    solo para los campos "sensibles" que realmente cambiaron.
    const camposSensibles = [
      { campo: 'nombre', anterior: existingProduct.nombre, nuevo: nombre },
      { campo: 'sku', anterior: existingProduct.sku, nuevo: sku },
      { campo: 'precioCompra', anterior: existingProduct.precioCompra.toString(), nuevo: parsedPrecioCompra.toString() },
      { campo: 'precioVenta', anterior: existingProduct.precioVenta.toString(), nuevo: parsedPrecioVenta.toString() },
      { campo: 'stockActual', anterior: existingProduct.stockActual.toString(), nuevo: parsedStockActual.toString() },
      { campo: 'categoria', anterior: existingProduct.categoria, nuevo: categoria },
      { campo: 'unidadMedida', anterior: existingProduct.unidadMedida, nuevo: unidadMedida },
      { campo: 'supplierId', anterior: existingProduct.supplierId?.toString() ?? null, nuevo: newSupplierId?.toString() ?? null },
    ];

    const cambios = camposSensibles.filter(c => c.anterior !== c.nuevo);

    // 3. Actualizar el producto y, si hubo cambios, registrar el historial,
    //    todo dentro de una transacción para que sea atómico.
    const [updatedProduct] = await prisma.$transaction([
      prisma.product.update({
        where: { id: productId, companyId: companyId },
        data: {
          nombre,
          descripcion,
          sku,
          precioCompra: parsedPrecioCompra,
          precioVenta: parsedPrecioVenta,
          stockActual: parsedStockActual,
          unidadMedida,
          categoria,
          imagenUrl,
          supplierId: newSupplierId,
          visibleEnCatalogo: visibleEnCatalogo !== undefined ? Boolean(visibleEnCatalogo) : existingProduct.visibleEnCatalogo,
        },
      }),
      ...(cambios.length > 0
        ? [prisma.productChangeLog.createMany({
            data: cambios.map(c => ({
              productId,
              companyId,
              userId,
              campo: c.campo,
              valorAnterior: c.anterior,
              valorNuevo: c.nuevo,
            })),
          })]
        : []),
    ]);

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
    if (error.code === 'P2003') {
      return res.status(409).json({ error: 'No puedes eliminar este producto porque ya tiene ventas, pedidos o movimientos de stock registrados.' });
    }
    res.status(500).json({ error: 'Error interno del servidor al eliminar el producto.' });
  }
};


// Activa o desactiva un producto. Un producto con historial (ventas —incluso
// anuladas—, pedidos o movimientos de stock) no se puede eliminar, así que
// esta es la forma de retirarlo del inventario, de las ventas y del catálogo
// sin perder ese historial. Es reversible y queda anotado en su historial de
// cambios.
const setProductActivo = async (req, res) => {
  const productId = parseInt(req.params.id, 10);
  const companyId = req.companyId;
  const userId = req.userId;
  const { activo } = req.body;

  if (!Number.isInteger(productId)) {
    return res.status(400).json({ error: 'Producto inválido.' });
  }
  if (typeof activo !== 'boolean') {
    return res.status(400).json({ error: 'El campo "activo" debe ser true o false.' });
  }

  try {
    const product = await prisma.product.findFirst({ where: { id: productId, companyId } });
    if (!product) {
      return res.status(404).json({ error: 'Producto no encontrado o no pertenece a tu compañía.' });
    }

    if (product.activo === activo) {
      return res.json({ message: `El producto ya estaba ${activo ? 'activo' : 'inactivo'}.`, product });
    }

    const [updated] = await prisma.$transaction([
      prisma.product.update({ where: { id: productId }, data: { activo } }),
      prisma.productChangeLog.create({
        data: { productId, companyId, userId, campo: 'activo', valorAnterior: String(product.activo), valorNuevo: String(activo) },
      }),
    ]);

    res.json({ message: `Producto ${activo ? 'reactivado' : 'desactivado'} con éxito.`, product: updated });
  } catch (error) {
    console.error('Error al cambiar el estado del producto:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
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
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { plan: true, planExpiresAt: true } });
  const limits = getPlanLimits(getEffectivePlanName(company));
  let remainingSlots = limits.maxProducts === Infinity
    ? Infinity
    : limits.maxProducts - await prisma.product.count({ where: { companyId, activo: true } });

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


// Función para consultar el historial de cambios de un producto
// (precios, stock manual, etc.), más reciente primero.
const getProductChangeLog = async (req, res) => {
  const { id } = req.params;
  const companyId = req.companyId;
  const productId = parseInt(id, 10);

  try {
    // Verificamos que el producto exista y sea de la compañía antes de mostrar su historial
    const product = await prisma.product.findFirst({
      where: { id: productId, companyId },
      select: { id: true },
    });
    if (!product) {
      return res.status(404).json({ error: 'Producto no encontrado o no pertenece a tu compañía.' });
    }

    const historial = await prisma.productChangeLog.findMany({
      where: { productId, companyId },
      orderBy: { fecha: 'desc' },
      include: { user: { select: { id: true, nombreUsuario: true } } },
    });

    res.json(historial);
  } catch (error) {
    console.error('Error al obtener historial de producto:', error);
    res.status(500).json({ error: 'Error interno del servidor al obtener el historial.' });
  }
};

module.exports = {
  getProducts,
  createProduct,
  updateProduct, // <-- Función corregida
  deleteProduct,
  setProductActivo,
  uploadProductsFromCsv,
  getProductChangeLog,
};
