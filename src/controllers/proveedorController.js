// backend/src/controllers/proveedorController.js

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Listar todos los proveedores de la compañía
const listSuppliers = async (req, res) => {
  const companyId = parseInt(req.companyId);

  try {
    const suppliers = await prisma.supplier.findMany({
      where: { companyId },
      orderBy: { nombre: 'asc' },
    });
    res.json(suppliers);
  } catch (error) {
    console.error('Error al obtener la lista de proveedores:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

// Crear un nuevo proveedor
const createSupplier = async (req, res) => {
  const { nombre, contacto, telefono, direccion } = req.body;
  const companyId = parseInt(req.companyId);

  if (!nombre) {
    return res.status(400).json({ error: 'El nombre del proveedor es obligatorio.' });
  }

  try {
    const newSupplier = await prisma.supplier.create({
      data: {
        nombre,
        contacto,
        telefono,
        direccion,
        companyId,
      },
    });
    res.status(201).json(newSupplier);
  } catch (error) {
    console.error('Error al crear el proveedor:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

// Actualizar un proveedor existente
const updateSupplier = async (req, res) => {
  const { id } = req.params;
  const companyId = parseInt(req.companyId);
  const { nombre, contacto, telefono, direccion } = req.body;

  try {
    const supplier = await prisma.supplier.findUnique({ where: { id: parseInt(id) } });

    if (!supplier || supplier.companyId !== companyId) {
      return res.status(404).json({ error: 'Proveedor no encontrado o no autorizado.' });
    }

    const updatedSupplier = await prisma.supplier.update({
      where: { id: parseInt(id) },
      data: { nombre, contacto, telefono, direccion },
    });
    res.json(updatedSupplier);
  } catch (error) {
    console.error('Error al actualizar el proveedor:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

// Eliminar un proveedor
const deleteSupplier = async (req, res) => {
  const { id } = req.params;
  const companyId = parseInt(req.companyId);

  try {
    const supplier = await prisma.supplier.findUnique({ where: { id: parseInt(id) } });

    if (!supplier || supplier.companyId !== companyId) {
      return res.status(404).json({ error: 'Proveedor no encontrado o no autorizado.' });
    }

    await prisma.supplier.delete({ where: { id: parseInt(id) } });
    res.status(200).json({ message: 'Proveedor eliminado con éxito.' });
  } catch (error) {
    console.error('Error al eliminar el proveedor:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

module.exports = {
  listSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
};