// backend/src/controllers/clienteController.js

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Listar todos los clientes de la compañía
const listClients = async (req, res) => {
  const companyId = parseInt(req.companyId); // Asegúrate de que sea un entero

  try {
    const clients = await prisma.client.findMany({
      where: { companyId },
      orderBy: { nombre: 'asc' },
    });
    res.json(clients);
  } catch (error) {
    console.error('Error al obtener la lista de clientes:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

// Crear un nuevo cliente
const createClient = async (req, res) => {
  const { nombre, email, telefono, direccion } = req.body;
  const companyId = parseInt(req.companyId);

  if (!nombre) {
    return res.status(400).json({ error: 'El nombre del cliente es obligatorio.' });
  }

  try {
    const newClient = await prisma.client.create({
      data: {
        nombre,
        email,
        telefono,
        direccion,
        companyId,
      },
    });
    res.status(201).json(newClient);
  } catch (error) {
    console.error('Error al crear el cliente:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

// Actualizar un cliente existente
const updateClient = async (req, res) => {
  const { id } = req.params;
  const companyId = parseInt(req.companyId);
  const { nombre, email, telefono, direccion } = req.body;

  try {
    const client = await prisma.client.findUnique({ where: { id: parseInt(id) } });

    if (!client || client.companyId !== companyId) {
      return res.status(404).json({ error: 'Cliente no encontrado o no autorizado.' });
    }

    const updatedClient = await prisma.client.update({
      where: { id: parseInt(id) },
      data: { nombre, email, telefono, direccion },
    });
    res.json(updatedClient);
  } catch (error) {
    console.error('Error al actualizar el cliente:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

// Eliminar un cliente
const deleteClient = async (req, res) => {
  const { id } = req.params;
  const companyId = parseInt(req.companyId);

  try {
    const client = await prisma.client.findUnique({ where: { id: parseInt(id) } });

    if (!client || client.companyId !== companyId) {
      return res.status(404).json({ error: 'Cliente no encontrado o no autorizado.' });
    }

    await prisma.client.delete({ where: { id: parseInt(id) } });
    res.status(200).json({ message: 'Cliente eliminado con éxito.' });
  } catch (error) {
    console.error('Error al eliminar el cliente:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

module.exports = {
  listClients,
  createClient,
  updateClient,
  deleteClient,
};