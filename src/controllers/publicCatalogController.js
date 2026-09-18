// backend/src/controllers/publicCatalogController.js
//
// Catálogo público (v1.2): SIN autenticación — cualquiera con el link puede
// verlo. Por eso acá aplican reglas que no existen en el resto de la API:
// nunca devolver más de lo que es seguro mostrar (nada de precioCompra,
// stockActual exacto, ids de otros clientes/pedidos), y nunca confiar en
// nada que mande el visitante sin validarlo contra la base real (eso lo
// hace el controlador de pedidos, no este — este solo lee).

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// GET /public/catalogo/:slug
const getCatalogoPublico = async (req, res) => {
  const { slug } = req.params;

  try {
    const company = await prisma.company.findUnique({
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

    // Un solo mensaje genérico tanto si el slug no existe como si la
    // compañía desactivó su catálogo (o su cuenta) — no hay necesidad de
    // distinguir esos casos para quien visita el link.
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

module.exports = { getCatalogoPublico };
