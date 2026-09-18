// backend/src/controllers/clienteController.js

const { PrismaClient } = require('@prisma/client');
const { normalizePhoneCO } = require('../utils/phone');
const prisma = new PrismaClient();

const TELEFONO_INVALIDO_MSG = 'Número de celular inválido. Usa un celular colombiano de 10 dígitos (ej. 3001234567).';

// Listar todos los clientes de la compañía
const listClients = async (req, res) => {
  const companyId = parseInt(req.companyId); // Asegúrate de que sea un entero

  // Paginación: evita traer todos los clientes de una sola vez cuando la
  // lista crece con el uso real del negocio.
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  try {
    const [clients, totalCount] = await Promise.all([
      prisma.client.findMany({
        where: { companyId },
        orderBy: { nombre: 'asc' },
        skip: skip,
        take: limit,
      }),
      prisma.client.count({ where: { companyId } }),
    ]);

    res.json({
      clients,
      totalPages: Math.ceil(totalCount / limit),
      currentPage: page,
      totalCount,
    });
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

  let telefonoNormalizado = null;
  if (telefono) {
    telefonoNormalizado = normalizePhoneCO(telefono);
    if (!telefonoNormalizado) {
      return res.status(400).json({ error: TELEFONO_INVALIDO_MSG });
    }
  }

  try {
    const newClient = await prisma.client.create({
      data: {
        nombre,
        email,
        telefono: telefonoNormalizado,
        direccion,
        companyId,
      },
    });
    res.status(201).json(newClient);
  } catch (error) {
    console.error('Error al crear el cliente:', error);
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Ya existe un cliente con ese nombre en tu compañía.' });
    }
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

// Actualizar un cliente existente
const updateClient = async (req, res) => {
  const { id } = req.params;
  const companyId = parseInt(req.companyId);
  const { nombre, email, telefono, direccion } = req.body;

  let telefonoNormalizado;
  if (telefono !== undefined) {
    telefonoNormalizado = telefono ? normalizePhoneCO(telefono) : null;
    if (telefono && !telefonoNormalizado) {
      return res.status(400).json({ error: TELEFONO_INVALIDO_MSG });
    }
  }

  try {
    const client = await prisma.client.findUnique({ where: { id: parseInt(id) } });

    if (!client || client.companyId !== companyId) {
      return res.status(404).json({ error: 'Cliente no encontrado o no autorizado.' });
    }

    const data = { nombre, email, direccion };
    if (telefono !== undefined) data.telefono = telefonoNormalizado;

    const updatedClient = await prisma.client.update({
      where: { id: parseInt(id) },
      data,
    });
    res.json(updatedClient);
  } catch (error) {
    console.error('Error al actualizar el cliente:', error);
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'Ya existe un cliente con ese nombre en tu compañía.' });
    }
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

// Activa o desactiva un cliente. Un cliente inactivo sigue existiendo (y
// conserva su historial de ventas) — solo deja de aparecer como opción para
// nuevas ventas; es la forma preferida de "dar de baja" a un cliente que ya
// tiene historial, en vez de borrarlo (ver nota en schema.prisma).
const setClientActivo = async (req, res) => {
  const { id } = req.params;
  const companyId = parseInt(req.companyId);
  const { activo } = req.body;

  if (typeof activo !== 'boolean') {
    return res.status(400).json({ error: 'El campo "activo" debe ser true o false.' });
  }

  try {
    const client = await prisma.client.findFirst({ where: { id: parseInt(id), companyId } });
    if (!client) {
      return res.status(404).json({ error: 'Cliente no encontrado o no autorizado.' });
    }

    const updated = await prisma.client.update({
      where: { id: parseInt(id) },
      data: { activo },
    });
    res.json({ message: `Cliente ${activo ? 'reactivado' : 'desactivado'} con éxito.`, client: updated });
  } catch (error) {
    console.error('Error al cambiar el estado del cliente:', error);
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

    // sales.client_id es ON DELETE SET NULL a nivel de base de datos (el
    // borrado nunca falla por P2003), así que la validación va acá: sin
    // esto, borrar un cliente con historial (incluida una venta pendiente)
    // deja la venta huérfana de cliente en silencio. Igual que con
    // productos, mejor bloquear y sugerir desactivar.
    const tieneVentas = await prisma.sale.count({ where: { clientId: parseInt(id) } });
    if (tieneVentas > 0) {
      return res.status(409).json({ error: 'Este cliente tiene ventas registradas; desactívalo en vez de eliminarlo.' });
    }

    await prisma.client.delete({ where: { id: parseInt(id) } });
    res.status(200).json({ message: 'Cliente eliminado con éxito.' });
  } catch (error) {
    console.error('Error al eliminar el cliente:', error);
    if (error.code === 'P2003') {
      return res.status(409).json({ error: 'No puedes eliminar este cliente porque ya tiene ventas registradas.' });
    }
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

// Busca un cliente por celular normalizado dentro de la compañía; si no
// existe, lo crea. Se usa desde la venta (POS) cuando el vendedor escribe
// "Nuevo cliente" en vez de elegir uno del selector — así dos ventas con el
// mismo celular no crean dos clientes distintos. `tx` es el cliente de
// Prisma (normal o de una transacción) que se use para la operación.
// Lanza un Error con `.status = 400` si el nombre falta o el celular no es
// un celular colombiano válido.
const findOrCreateCliente = async (tx, companyId, { nombre, telefono }) => {
  if (!nombre || !nombre.trim()) {
    const err = new Error('El nombre del cliente es obligatorio.');
    err.status = 400;
    throw err;
  }

  const telefonoNormalizado = normalizePhoneCO(telefono);
  if (!telefonoNormalizado) {
    const err = new Error(TELEFONO_INVALIDO_MSG);
    err.status = 400;
    throw err;
  }

  const existente = await tx.client.findFirst({
    where: { companyId, telefono: telefonoNormalizado },
  });
  if (existente) {
    return { cliente: existente, reutilizado: true };
  }

  const creado = await tx.client.create({
    data: { companyId, nombre: nombre.trim(), telefono: telefonoNormalizado, activo: true },
  });
  return { cliente: creado, reutilizado: false };
};

// Cartera: para cada cliente de la compañía con al menos una venta
// PENDIENTE o PARCIAL activa (no anulada), su saldo adeudado, cuántas
// ventas pendientes tiene, y la antigüedad (en días) de la más vieja —
// justo lo que hace falta para decidir a quién cobrarle primero.
const getCartera = async (req, res) => {
  const companyId = req.companyId;

  try {
    const ventasPendientes = await prisma.sale.findMany({
      where: {
        companyId,
        estado: { not: 'ANULADA' },
        estadoPago: { in: ['PENDIENTE', 'PARCIAL'] },
        clientId: { not: null },
      },
      include: {
        client: { select: { id: true, nombre: true, telefono: true } },
        payments: { where: { anulado: false }, select: { monto: true } },
      },
      orderBy: { fechaVenta: 'asc' },
    });

    const ahora = Date.now();
    const porCliente = new Map();

    for (const venta of ventasPendientes) {
      const pagado = venta.payments.reduce((sum, p) => sum + Number(p.monto), 0);
      const saldo = Number(venta.total) - pagado;
      const diasAntiguedad = Math.floor((ahora - new Date(venta.fechaVenta).getTime()) / 86400000);

      const entry = porCliente.get(venta.client.id) || {
        clienteId: venta.client.id,
        nombre: venta.client.nombre,
        telefono: venta.client.telefono,
        totalAdeudado: 0,
        ventasPendientes: [],
      };

      entry.totalAdeudado += saldo;
      entry.ventasPendientes.push({
        saleId: venta.id,
        fecha: venta.fechaVenta,
        total: Number(venta.total),
        pagado,
        saldo,
        diasAntiguedad,
        estadoPago: venta.estadoPago,
      });

      porCliente.set(venta.client.id, entry);
    }

    const cartera = Array.from(porCliente.values()).sort((a, b) => b.totalAdeudado - a.totalAdeudado);

    res.json(cartera);
  } catch (error) {
    console.error('Error al calcular la cartera:', error);
    res.status(500).json({ error: 'Error interno del servidor al calcular la cartera.' });
  }
};

module.exports = {
  listClients,
  createClient,
  updateClient,
  setClientActivo,
  deleteClient,
  findOrCreateCliente,
  getCartera,
  TELEFONO_INVALIDO_MSG,
};