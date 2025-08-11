// venta_inventario_app/backend/src/controllers/receiptController.js

const { PrismaClient } = require('@prisma/client');
const PDFDocument = require('pdfkit'); // Importamos PDFKit
const prisma = new PrismaClient();

const generateSaleReceiptPdf = async (req, res) => {
  const { saleId } = req.params; // Obtener el ID de la venta desde los parámetros de la URL
  const companyId = req.companyId; // ID de la compañía del usuario autenticado

  try {
    // 1. Obtener los datos de la venta y sus ítems
    const sale = await prisma.sale.findUnique({
      where: {
        id: parseInt(saleId),
        companyId: companyId, // Aseguramos que la venta pertenezca a la compañía del usuario
      },
      include: {
        user: true, // Incluimos la información del usuario que realizó la venta
        saleItems: {
          include: {
            product: true, // Incluimos la información del producto de cada ítem
          },
        },
        client: true, // Incluimos la información del cliente, si existe
        company: true, // Incluimos la información de la compañía
      },
    });

    if (!sale) {
      return res.status(404).json({ error: 'Venta no encontrada o no pertenece a tu compañía.' });
    }

    // 2. Crear un nuevo documento PDF
    const doc = new PDFDocument({ margin: 50 });

    // Configurar los encabezados de la respuesta para que el navegador descargue el PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=recibo_venta_${saleId}.pdf`);

    // Pipe el documento PDF a la respuesta HTTP
    doc.pipe(res);

    // 3. Contenido del Recibo
    // Información de la Compañía
    doc.fontSize(20).text(sale.company.nombre.toUpperCase(), { align: 'center' });
    doc.fontSize(10).text(sale.company.direccion || '', { align: 'center' });
    doc.text(`Tel: ${sale.company.telefono || ''} | Email: ${sale.company.emailContacto || ''}`, { align: 'center' });
    doc.moveDown();

    // Título del Recibo
    doc.fontSize(16).text('RECIBO DE VENTA', { align: 'center' });
    doc.fontSize(12).text(`No. Venta: ${sale.id}`, { align: 'center' });
    doc.text(`Fecha: ${new Date(sale.fechaVenta).toLocaleDateString('es-CO')}`, { align: 'center' });
    doc.moveDown();

    // Información del Cliente (si existe)
    if (sale.client) {
      doc.fontSize(12).text(`Cliente: ${sale.client.nombre}`);
      doc.text(`Email: ${sale.client.email || 'N/A'}`);
      doc.text(`Teléfono: ${sale.client.telefono || 'N/A'}`);
      doc.moveDown();
    } else {
      doc.fontSize(12).text('Cliente: Consumidor Final');
      doc.moveDown();
    }

    // Encabezados de la tabla de ítems
    const tableTop = doc.y;
    const col1 = 50;
    const col2 = 200;
    const col3 = 300;
    const col4 = 400;
    const col5 = 500;

    doc.fontSize(10).font('Helvetica-Bold');
    doc.text('Producto', col1, tableTop, { width: 150 });
    doc.text('Cant.', col2, tableTop, { width: 50 });
    doc.text('P. Unitario', col3, tableTop, { width: 80 });
    doc.text('Subtotal', col4, tableTop, { width: 80 });
    doc.font('Helvetica');
    doc.moveDown();

    // Filas de la tabla de ítems
    let yPosition = doc.y;
    sale.saleItems.forEach(item => {
      doc.text(item.product.nombre, col1, yPosition, { width: 150 });
      doc.text(item.cantidad.toString(), col2, yPosition, { width: 50 });
      doc.text(item.precioUnitario.toFixed(2), col3, yPosition, { width: 80 });
      doc.text(item.subtotal.toFixed(2), col4, yPosition, { width: 80 });
      yPosition += 20; // Espacio entre filas
      if (yPosition > 700) { // Para evitar que se desborde la página
        doc.addPage();
        yPosition = 50; // Reiniciar posición en la nueva página
      }
    });
    doc.moveDown();

    // Total de la Venta
    doc.fontSize(14).font('Helvetica-Bold');
    doc.text(`TOTAL: ${sale.total.toFixed(2)}`, { align: 'right' });
    doc.moveDown();

    // Información adicional
    doc.fontSize(10).font('Helvetica');
    doc.text(`Atendido por: ${sale.user.nombreUsuario}`, { align: 'left' });
    doc.text('¡Gracias por tu compra!', { align: 'center' });

    // Finalizar el documento
    doc.end();

  } catch (error) {
    console.error('Error al generar el recibo PDF:', error);
    res.status(500).json({ error: 'Error al generar el recibo.' });
  }
};

module.exports = {
  generateSaleReceiptPdf,
};
