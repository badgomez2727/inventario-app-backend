// backend/src/controllers/publicCatalogController.js
//
// Catálogo público (v1.2): SIN autenticación — cualquiera con el link puede
// verlo. Por eso acá aplican reglas que no existen en el resto de la API:
// nunca devolver más de lo que es seguro mostrar (nada de precioCompra,
// stockActual exacto, ids de otros clientes/pedidos), y nunca confiar en
// nada que mande el visitante sin validarlo contra la base real (eso lo
// hace el controlador de pedidos, no este — este solo lee).

const { PrismaClient } = require('@prisma/client');
const { findOrCreateCliente } = require('./clienteController');
const { normalizePhoneCO } = require('../utils/phone');
const prisma = new PrismaClient();

const TIPOS_ENTREGA = ['RECOGE', 'DOMICILIO'];

// Compañía "publicable" por su slug: existe, está activa, y activó su
// catálogo. Usado tanto para leerlo como para recibir un pedido — un solo
// mensaje genérico (404) cubre "el slug no existe" y "está desactivado",
// sin distinguir esos casos para quien está afuera.
const findCompanyPublica = (slug) =>
  prisma.company.findUnique({
    where: { slug },
    select: {
      id: true,
      nombre: true,
      descripcionCatalogo: true,
      fotoPortadaCatalogo: true,
      whatsappVentas: true,
      ofreceDomicilio: true,
      valorDomicilioDefault: true,
      activo: true,
      catalogoPublicoActivo: true,
    },
  });

// GET /public/catalogo/:slug
const getCatalogoPublico = async (req, res) => {
  const { slug } = req.params;

  try {
    const company = await findCompanyPublica(slug);

    if (!company || !company.activo || !company.catalogoPublicoActivo) {
      return res.status(404).json({ error: 'Catálogo no encontrado.' });
    }

    const products = await prisma.product.findMany({
      where: { companyId: company.id, activo: true, visibleEnCatalogo: true },
      select: {
        id: true,
        nombre: true,
        descripcion: true,
        precioVenta: true,
        categoria: true,
        stockActual: true,
        images: { orderBy: { orden: 'asc' }, select: { url: true } },
      },
      orderBy: { nombre: 'asc' },
    });

    res.json({
      company: {
        nombre: company.nombre,
        descripcionCatalogo: company.descripcionCatalogo,
        fotoPortadaCatalogo: company.fotoPortadaCatalogo,
        whatsappVentas: company.whatsappVentas,
        ofreceDomicilio: company.ofreceDomicilio,
        valorDomicilioDefault: company.valorDomicilioDefault,
      },
      products: products.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        descripcion: p.descripcion,
        precioVenta: p.precioVenta,
        categoria: p.categoria,
        disponible: p.stockActual > 0, // nunca se expone el stock exacto
        imagenes: p.images.map((img) => img.url),
      })),
    });
  } catch (error) {
    console.error('Error al obtener el catálogo público:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

const formatCOP = (valor) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(Number(valor));

// Arma el texto del mensaje que se le manda al negocio por WhatsApp — se
// arma en el servidor (no en el navegador) para que el formato sea siempre
// consistente y para no depender de que el frontend rearme el resumen bien.
const buildWhatsappMessage = ({ pedido, items, company, cliente }) => {
  const lineas = items.map((item) => `${item.cantidad}x ${item.nombreProducto} - ${formatCOP(item.subtotal)}`);
  const entrega = pedido.tipoEntrega === 'DOMICILIO' ? 'Domicilio' : 'Recoger en el negocio';

  const partes = [
    `¡Hola! Quiero hacer este pedido en ${company.nombre}:`,
    '',
    ...lineas,
    '',
    `Entrega: ${entrega}`,
  ];

  if (pedido.tipoEntrega === 'DOMICILIO') {
    partes.push(`Dirección: ${pedido.direccionEntrega}`);
    if (pedido.valorDomicilio != null) {
      partes.push(`Domicilio: ${formatCOP(pedido.valorDomicilio)}`);
    }
  }

  partes.push('', `Total: ${formatCOP(pedido.total)}`, '', `Cliente: ${cliente.nombre} (${cliente.telefono})`, `Pedido #${pedido.id}`);

  return partes.join('\n');
};

// POST /public/catalogo/:slug/pedido
const crearPedido = async (req, res) => {
  const { slug } = req.params;
  const { items, cliente, tipoEntrega, direccionEntrega } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'El pedido debe tener al menos un producto.' });
  }
  if (!TIPOS_ENTREGA.includes(tipoEntrega)) {
    return res.status(400).json({ error: `El tipo de entrega debe ser uno de: ${TIPOS_ENTREGA.join(', ')}.` });
  }
  if (tipoEntrega === 'DOMICILIO' && !direccionEntrega?.trim()) {
    return res.status(400).json({ error: 'La dirección es obligatoria para pedidos a domicilio.' });
  }
  if (!cliente?.nombre?.trim() || !cliente?.telefono?.trim()) {
    return res.status(400).json({ error: 'El nombre y el celular son obligatorios.' });
  }

  try {
    const company = await findCompanyPublica(slug);
    if (!company || !company.activo || !company.catalogoPublicoActivo) {
      return res.status(404).json({ error: 'Catálogo no encontrado.' });
    }

    if (tipoEntrega === 'DOMICILIO' && !company.ofreceDomicilio) {
      return res.status(400).json({ error: 'Esta tienda no ofrece domicilio. Elige "Recoger en el negocio".' });
    }

    const resultado = await prisma.$transaction(async (tx) => {
      // findOrCreateCliente ya lanza un error con .status=400 si el nombre
      // o el celular no son válidos (ver clienteController.js).
      const { cliente: clienteResuelto } = await findOrCreateCliente(tx, company.id, cliente);

      const itemsResueltos = [];
      for (const item of items) {
        const productId = parseInt(item.productId, 10);
        const cantidad = parseInt(item.cantidad, 10);
        if (!Number.isInteger(productId) || !Number.isInteger(cantidad) || cantidad <= 0) {
          const err = new Error('Cada ítem del pedido necesita un producto y una cantidad válida.');
          err.status = 400;
          throw err;
        }

        // Nunca se confía en el nombre/precio que mande el visitante — se
        // recalcula todo del producto real, y solo si sigue publicado.
        const product = await tx.product.findFirst({
          where: { id: productId, companyId: company.id, activo: true, visibleEnCatalogo: true },
        });
        if (!product) {
          const err = new Error('Uno de los productos del pedido ya no está disponible en el catálogo.');
          err.status = 400;
          throw err;
        }
        // Chequeo informativo, no una reserva: el stock real se descuenta
        // de forma atómica recién cuando el negocio confirma el pedido
        // (ver saleController.js -> confirmarPedido, siguiente parte).
        if (product.stockActual < cantidad) {
          const err = new Error(`No hay suficiente stock de "${product.nombre}" en este momento.`);
          err.status = 400;
          throw err;
        }

        const precioUnitario = Number(product.precioVenta);
        itemsResueltos.push({
          productId: product.id,
          nombreProducto: product.nombre,
          cantidad,
          precioUnitario,
          subtotal: precioUnitario * cantidad,
        });
      }

      const totalItems = itemsResueltos.reduce((sum, item) => sum + item.subtotal, 0);
      const valorDomicilio = tipoEntrega === 'DOMICILIO' ? Number(company.valorDomicilioDefault || 0) : null;
      const total = totalItems + (valorDomicilio || 0);

      const pedido = await tx.pedido.create({
        data: {
          companyId: company.id,
          clientId: clienteResuelto.id,
          tipoEntrega,
          direccionEntrega: tipoEntrega === 'DOMICILIO' ? direccionEntrega.trim() : null,
          valorDomicilio,
          total,
          items: {
            create: itemsResueltos.map((item) => ({
              productId: item.productId,
              cantidad: item.cantidad,
              precioUnitario: item.precioUnitario,
              subtotal: item.subtotal,
            })),
          },
        },
      });

      return { pedido, itemsResueltos, clienteResuelto };
    });

    const whatsappNumero = company.whatsappVentas[0]?.replace('+', '');
    const mensaje = buildWhatsappMessage({
      pedido: resultado.pedido,
      items: resultado.itemsResueltos,
      company,
      cliente: resultado.clienteResuelto,
    });
    const whatsappUrl = whatsappNumero
      ? `https://wa.me/${whatsappNumero}?text=${encodeURIComponent(mensaje)}`
      : null;

    res.status(201).json({
      message: 'Pedido enviado con éxito.',
      pedidoId: resultado.pedido.id,
      total: resultado.pedido.total,
      whatsappUrl,
    });
  } catch (error) {
    console.error('Error al crear el pedido público:', error);
    res.status(error.status || 500).json({ error: error.message || 'Error interno al crear el pedido.' });
  }
};

module.exports = { getCatalogoPublico, crearPedido };
