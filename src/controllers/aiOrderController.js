// backend/src/controllers/aiOrderController.js
//
// Convierte un mensaje de WhatsApp pegado por el tendero en un borrador de
// venta, cotejando el texto libre contra el catálogo real de la compañía
// con la API de Claude. Función exclusiva del plan PRO (ver requirePlan en
// middlewares/planLimits.js, aplicado en routes/aiOrderRoutes.js).
//
// NOTA: esta lógica debería vivir en src/services/aiOrderService.js junto al
// resto de servicios, pero esa carpeta quedó con permisos de solo-lectura
// para el usuario (dueña root, sin bit de escritura) — hay que corregir eso
// con `sudo chown` fuera de esta sesión y entonces mover este archivo allá.

const { PrismaClient } = require('@prisma/client');
const Anthropic = require('@anthropic-ai/sdk');

const prisma = new PrismaClient();
const anthropic = new Anthropic(); // Lee ANTHROPIC_API_KEY del entorno (.env).

// Un pedido real de WhatsApp nunca es tan largo; esto es un techo de
// abuso/costo, no una restricción normal de uso.
const MAX_TEXT_LENGTH = 4000;

// Haiku 4.5 es el modelo más barato de Anthropic ($1/$5 por millón de
// tokens de entrada/salida) y sobra para esta tarea: es extracción de datos
// sobre un catálogo cerrado, no razonamiento complejo. Si en la práctica la
// precisión no alcanza, subir a 'claude-sonnet-5' es un cambio de una línea.
const MODEL_ID = 'claude-haiku-4-5';

// Modo demo/pruebas: con AI_ORDER_MOCK=true en .env, este endpoint NUNCA
// llama a la API de Claude (cero tokens, cero costo) y en su lugar arma el
// borrador con una heurística local de coincidencia de palabras sobre el
// catálogo real. Sirve para grabar un video o probar el flujo completo
// (pegar texto -> revisar -> confirmar venta) sin gastar un solo token real.
// Es deliberadamente más simple/tosca que la IA real — para validar
// precisión de verdad hay que quitar esta variable y usar una API key real.
const IS_MOCK = process.env.AI_ORDER_MOCK === 'true';

// Herramienta de esquema fijo: obligamos a Claude a responder SOLO con esto
// (tool_choice más abajo), así el resultado siempre es JSON válido y
// predecible en vez de tener que parsear texto libre.
const EXTRACT_ORDER_TOOL = {
  name: 'registrar_pedido_extraido',
  description:
    'Registra los ítems del pedido identificados en el mensaje del cliente, cotejados con el catálogo de productos real de la tienda que se dio en el prompt.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      cliente: {
        type: 'object',
        description: 'Datos del cliente si se mencionan en el mensaje. Cadena vacía en cada campo si no aparece.',
        properties: {
          nombre: { type: 'string' },
          telefono: { type: 'string' },
        },
        required: ['nombre', 'telefono'],
        additionalProperties: false,
      },
      items: {
        type: 'array',
        description: 'Un ítem por cada producto que el cliente pidió.',
        items: {
          type: 'object',
          properties: {
            textoOriginal: { type: 'string', description: 'El fragmento del mensaje original que originó este ítem.' },
            productoId: { type: 'integer', description: 'El id del producto del catálogo que mejor coincide. 0 si ningún producto del catálogo coincide con claridad.' },
            cantidad: { type: 'integer', description: 'Cantidad pedida. Si no se menciona, usar 1.' },
            confianza: { type: 'string', enum: ['alta', 'media', 'baja'], description: 'Qué tan seguro estás de que productoId es el producto correcto.' },
          },
          required: ['textoOriginal', 'productoId', 'cantidad', 'confianza'],
          additionalProperties: false,
        },
      },
    },
    required: ['cliente', 'items'],
    additionalProperties: false,
  },
};

const SYSTEM_INSTRUCTIONS = `Eres el asistente de un tendero colombiano que recibe pedidos de sus clientes por WhatsApp. Te va a pasar el texto de un mensaje (a veces desordenado, con abreviaturas, sin tildes, con emojis) y el catálogo real de productos de su tienda. Tu única tarea es identificar qué productos del catálogo pidió el cliente y en qué cantidad, usando la herramienta registrar_pedido_extraido.

Reglas:
- Compara el texto contra el catálogo por significado, no solo por coincidencia literal (ej. "gaseosa grande" puede ser "Coca-Cola 1.5L").
- Si el texto menciona algo que no está en el catálogo o la coincidencia no es clara, igual crea el ítem con productoId 0 y confianza "baja" para que el tendero lo revise a mano.
- Nunca inventes productos ni ids que no estén en el catálogo dado.
- Si no se menciona cantidad para un ítem, usa 1.
- Si el mensaje trae nombre o teléfono del cliente, inclúyelo en "cliente"; si no, deja esos campos como cadena vacía.`;

const buildCatalogText = (products) =>
  products.map((p) => `${p.id}|${p.nombre}|SKU:${p.sku}|stock:${p.stockActual}`).join('\n');

// --- Heurística local para el modo demo (IS_MOCK) ---------------------
// Nada de esto llama a ningún servicio externo; es solo coincidencia de
// texto sobre el catálogo real de la compañía, para que el borrador
// simulado se sienta parecido al real en una demo/video.

const WORD_NUMBERS = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5,
  seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
};

const normalizeText = (str) =>
  str
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita tildes
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const splitIntoChunks = (texto) =>
  texto
    .split(/[,\n;.]| y (?=\d|un |una |dos |tres |cuatro |cinco |seis |siete |ocho |nueve |diez |el |la |los |las )/i)
    .map((s) => s.trim())
    .filter(Boolean);

const extractQuantity = (chunkNorm) => {
  const digitMatch = chunkNorm.match(/\b(\d+)\b/);
  if (digitMatch) return parseInt(digitMatch[1], 10);
  for (const [word, num] of Object.entries(WORD_NUMBERS)) {
    if (new RegExp(`\\b${word}\\b`).test(chunkNorm)) return num;
  }
  return 1;
};

// Qué tanto se parece un fragmento del mensaje a un producto del catálogo:
// proporción de palabras "significativas" (>=3 letras) del nombre del
// producto que aparecen en el fragmento.
const scoreProduct = (chunkNorm, productNombreNorm) => {
  const words = productNombreNorm.split(' ').filter((w) => w.length >= 3);
  if (words.length === 0) return 0;
  const matched = words.filter((w) => chunkNorm.includes(w)).length;
  return matched / words.length;
};

const extractCliente = (texto) => {
  const nombreMatch = texto.match(/(?:soy|mi nombre es|me llamo)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)/i);
  const telefonoMatch = texto.match(/\b(\d{7,10})\b/);
  return {
    nombre: nombreMatch ? nombreMatch[1] : '',
    telefono: telefonoMatch ? telefonoMatch[1] : '',
  };
};

const simulateOrderExtraction = (texto, products) => {
  const productsNorm = products.map((p) => ({ id: p.id, nombreNorm: normalizeText(p.nombre) }));
  const chunks = splitIntoChunks(texto);

  const items = [];
  for (const chunk of chunks) {
    const chunkNorm = normalizeText(chunk);
    if (!chunkNorm) continue;

    let best = { id: 0, score: 0 };
    for (const p of productsNorm) {
      const score = scoreProduct(chunkNorm, p.nombreNorm);
      if (score > best.score) best = { id: p.id, score };
    }

    // Fragmento sin ninguna pista de producto (ej. "me lo envía a la casa
    // de siempre"): lo ignoramos, no es un ítem del pedido.
    if (best.score < 0.25) continue;

    const cantidad = extractQuantity(chunkNorm);
    const tieneMatchClaro = best.score >= 0.55;
    items.push({
      textoOriginal: chunk,
      productoId: tieneMatchClaro ? best.id : 0,
      cantidad,
      confianza: best.score >= 0.75 ? 'alta' : best.score >= 0.55 ? 'media' : 'baja',
    });
  }

  return { cliente: extractCliente(texto), items };
};
// ------------------------------------------------------------------------

const parseWhatsappOrder = async (req, res) => {
  const { texto } = req.body;
  const companyId = req.companyId;

  if (!texto || typeof texto !== 'string' || !texto.trim()) {
    return res.status(400).json({ error: 'Falta el texto del pedido a interpretar.' });
  }
  if (texto.length > MAX_TEXT_LENGTH) {
    return res.status(400).json({ error: `El texto es demasiado largo (máximo ${MAX_TEXT_LENGTH} caracteres).` });
  }

  try {
    const products = await prisma.product.findMany({
      where: { companyId, activo: true },
      select: { id: true, nombre: true, sku: true, precioVenta: true, stockActual: true },
      orderBy: { nombre: 'asc' },
    });

    if (products.length === 0) {
      return res.status(400).json({ error: 'Todavía no tienes productos activos en tu catálogo para poder generar el borrador.' });
    }

    let cliente;
    let items;
    let usoTokens = null;

    if (IS_MOCK) {
      // Modo demo: nada de red ni de tokens reales, solo la heurística
      // local. El pequeño delay es solo para que la UI se sienta igual
      // que una llamada real al grabar un video de demo.
      await new Promise((resolve) => setTimeout(resolve, 900));
      ({ cliente, items } = simulateOrderExtraction(texto, products));
    } else {
      const catalogText = buildCatalogText(products);

      let response;
      try {
        response = await anthropic.messages.create({
          model: MODEL_ID,
          max_tokens: 2048,
          system: [
            {
              type: 'text',
              text: `${SYSTEM_INSTRUCTIONS}\n\nCatálogo (id|nombre|SKU|stock):\n${catalogText}`,
              // El catálogo es lo que más pesa en tokens y cambia poco entre
              // pedidos de la misma compañía: cachearlo abarata las pruebas
              // seguidas y el uso normal (lecturas repetidas del mismo bloque
              // cuestan ~10% del precio normal en vez del 100%).
              cache_control: { type: 'ephemeral' },
            },
          ],
          tools: [EXTRACT_ORDER_TOOL],
          tool_choice: { type: 'tool', name: 'registrar_pedido_extraido' },
          messages: [{ role: 'user', content: texto }],
        });
      } catch (aiError) {
        console.error('Error al llamar a la API de Claude:', aiError);
        if (aiError instanceof Anthropic.AuthenticationError) {
          return res.status(502).json({ error: 'El asistente de IA no está configurado correctamente (falta o es inválida la API key). Contacta soporte.' });
        }
        if (aiError instanceof Anthropic.RateLimitError) {
          return res.status(502).json({ error: 'El asistente de IA está saturado en este momento. Intenta de nuevo en unos segundos.' });
        }
        return res.status(502).json({ error: 'El asistente de IA no pudo procesar el pedido. Intenta de nuevo.' });
      }

      const toolUse = response.content.find((block) => block.type === 'tool_use');
      if (!toolUse) {
        return res.status(502).json({ error: 'El asistente de IA no devolvió un resultado interpretable. Intenta de nuevo.' });
      }

      ({ cliente, items } = toolUse.input);
      usoTokens = {
        entrada: response.usage.input_tokens,
        salida: response.usage.output_tokens,
        cacheLectura: response.usage.cache_read_input_tokens || 0,
      };
    }

    const productsById = new Map(products.map((p) => [p.id, p]));

    const draftItems = items.map((item) => {
      const product = productsById.get(item.productoId) || null;
      const cantidad = Math.max(1, parseInt(item.cantidad, 10) || 1);
      const precioUnitario = product ? Number(product.precioVenta) : 0;
      return {
        textoOriginal: item.textoOriginal,
        confianza: item.confianza,
        cantidad,
        productoId: product ? product.id : null,
        nombreProducto: product ? product.nombre : null,
        stockDisponible: product ? product.stockActual : null,
        precioUnitario,
        subtotal: precioUnitario * cantidad,
        sinCoincidencia: !product,
      };
    });

    const total = draftItems.reduce((sum, item) => sum + item.subtotal, 0);

    res.json({
      cliente: {
        nombre: cliente?.nombre || '',
        telefono: cliente?.telefono || '',
      },
      items: draftItems,
      total,
      // Le dice al frontend si este borrador salió de la IA real o de la
      // heurística local de demo, para mostrar un aviso claro al tendero.
      simulado: IS_MOCK,
      // Info de diagnóstico (no crítica para el frontend) útil mientras se
      // prueba el consumo real de tokens/costo. null en modo demo.
      usoTokens,
    });
  } catch (error) {
    console.error('Error al interpretar pedido de WhatsApp con IA:', error);
    res.status(500).json({ error: 'Error interno al interpretar el pedido.' });
  }
};

module.exports = { parseWhatsappOrder };
