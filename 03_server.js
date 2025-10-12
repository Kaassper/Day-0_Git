// =============================================================================
// Microservicio REST: Chatbot Documental (RAG + LLM local)
// Idioma: Español
// =============================================================================

import express from 'express';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import { pipeline } from '@xenova/transformers';

// Carga de variables de entorno
dotenv.config();

// __dirname en ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// App Express
const app = express();
app.use(express.json());

// Variables de entorno requeridas
const PORT = Number(process.env.PORT || 3000);
const MONGO_URI = process.env.MONGO_URI || '';
const MONGO_DB = process.env.MONGO_DB || process.env.MONGO_DB_NAME || '';
const MODEL_PATH = process.env.MODEL_PATH ? path.resolve(__dirname, process.env.MODEL_PATH) : '';

// Estado global
let embeddingPipeline = null;  // Modelo de embeddings (Xenova)
let llamaModel = null;         // Instancia del LLM
let LlamaContextClass = null;  // Clases del runtime Llama
let LlamaChatSessionClass = null;
let Knowledge = null;          // Modelo Mongoose

// Esquema de conocimiento
const knowledgeSchema = new mongoose.Schema({
  source: { type: String, required: true },
  content: { type: String, required: true },
  embedding: { type: [Number], required: true },
}, { versionKey: false, strict: true });

// Helper: forzar no-SRV y añadir parámetros de conexión seguros
function buildMongoUriNoSrv(input) {
  try {
    const u = new URL(input);
    // Si es SRV, intentamos cambiar a mongodb://
    if (u.protocol === 'mongodb+srv:') {
      u.protocol = 'mongodb:'; // fuerza modo no-SRV
    }
    // Eliminar parámetros potencialmente no soportados
    if (u.searchParams.has('srv')) u.searchParams.delete('srv');
    // Mantener parámetros opcionales si existen, pero no forzar 'srv'
    if (!u.searchParams.has('appName')) u.searchParams.set('appName', 'inacapito-rag');
    return u.toString();
  } catch {
    // Si falla el parser, devolver tal cual (sin añadir 'srv=false')
    return input;
  }
}

// Utilidad: verificar estado de conexión de Mongoose
function isDbConnected() {
  try {
    return mongoose.connection && mongoose.connection.readyState === 1; // 1 = connected
  } catch {
    return false;
  }
}

// ---------------------------- Inicializaciones ------------------------------
async function connectToMongoDB() {
  console.log('  - Conectando a MongoDB...');

  try {
    const cleanUri = buildMongoUriNoSrv(MONGO_URI);
    await mongoose.connect(cleanUri);
    
    Knowledge = mongoose.models.Knowledge || mongoose.model('Knowledge', knowledgeSchema, 'knowledge');
    console.log('  ✅ [SUCCESS] Conectado a MongoDB');
  } catch (e) {
    console.warn('[WARN] No se pudo conectar a MongoDB. Arrancando sin base de datos.');
    console.warn('Motivo:', e?.message || e);
  }
}

async function initializeEmbeddingModel() {
  console.log('  - Cargando modelo de embeddings (Xenova/all-MiniLM-L6-v2)...');
  embeddingPipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  console.log('  ✅ Embeddings listos');
}

async function initializeLlamaModel() {
  if (!MODEL_PATH) {
    throw new Error('Falta MODEL_PATH en .env');
  }
  console.log(`  - Cargando LLM desde: ${MODEL_PATH}`);
  
  // Intento 1: node-llama-cpp (más estable)
  try {
    const { LlamaModel, LlamaContext, LlamaChatSession } = await import('node-llama-cpp');
    LlamaContextClass = LlamaContext;
    LlamaChatSessionClass = LlamaChatSession;
    llamaModel = new LlamaModel({ modelPath: MODEL_PATH });
    console.log('  ✅ LLM cargado (node-llama-cpp)');
    return;
  } catch (e1) {
    console.log(`    Intento con node-llama-cpp falló: ${e1.message}`);
  }

  // Intento 2: llama-cpp-node (fallback)
  try {
    const llamaCppMod = await import('llama-cpp-node');
    const LlamaModelClass = llamaCppMod.LlamaModel || llamaCppMod.default;
    LlamaContextClass = llamaCppMod.LlamaContext || llamaCppMod.default?.LlamaContext;
    LlamaChatSessionClass = llamaCppMod.LlamaChatSession || llamaCppMod.default?.LlamaChatSession;
    
    if (!LlamaModelClass) {
      throw new Error('No se encontró LlamaModel en llama-cpp-node');
    }
    
    llamaModel = new LlamaModelClass({ modelPath: MODEL_PATH });
    console.log('  ✅ LLM cargado (llama-cpp-node)');
    return;
  } catch (e2) {
    console.log(`    Intento con llama-cpp-node falló: ${e2.message}`);
  }

  throw new Error('No se pudo cargar ninguna implementación de Llama (node-llama-cpp / llama-cpp-node).');
}

// ----------------------------- Utilidades RAG -------------------------------
async function generateEmbedding(texto) {
  if (!embeddingPipeline) {
    // Sin embeddings, no podemos hacer búsqueda vectorial; el endpoint gestionará la negación
    return [];
  }
  const out = await embeddingPipeline(texto, { pooling: 'mean', normalize: true });
  return Array.from(out.data);
}

async function vectorSearch(queryEmbedding, topK = 4) {
  // Si no hay DB o modelo Knowledge, devolvemos array vacío como fallback
  if (!Knowledge || !isDbConnected()) return [];
  
  const results = await Knowledge.aggregate([
    { $vectorSearch: { index: 'vector_index', path: 'embedding', queryVector: queryEmbedding, numCandidates: 100, limit: topK } },
    { $project: { _id: 0, source: 1, content: 1, score: { $meta: 'vectorSearchScore' } } }
  ]);
  return results;
}

async function generateResponse(userQuery, contextChunks) {
  // Fallback si el LLM no está disponible
  if (!llamaModel || !LlamaContextClass || !LlamaChatSessionClass) {
    return 'No puedo confirmar eso con los documentos proporcionados.';
  }

  const contexto = contextChunks.map(c => c.content).join('\n\n---\n\n');
  const systemPrompt = 'Eres "Inacapito", un asistente de IA que responde SOLO con el contexto proporcionado. Si no hay información suficiente en el contexto, responde exactamente: "No puedo confirmar eso con los documentos proporcionados." Responde en español, claro y conciso.';
  const prompt = `Contexto de documentos:\n${contexto}\n---\nPregunta: "${userQuery}"\n\nRespuesta:`;

  const ctx = new LlamaContextClass({ model: llamaModel, contextSize: 1024 });
  const session = new LlamaChatSessionClass({ context: ctx, systemPrompt });
  const respuesta = await session.prompt(prompt, { temperature: 0.2, maxTokens: 512 });
  return respuesta;
}

// --------------------------------- Rutas ------------------------------------
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.post('/chat', async (req, res) => {
  try {
    const { query, topK } = req.body || {};
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({ error: 'Body inválido: se requiere "query" (string)' });
    }

    // Si no hay embeddings, negar directamente
    if (!embeddingPipeline) {
      return res.json({ answer: 'No puedo confirmar eso con los documentos proporcionados.', sources: [], confidence: 'baja' });
    }

    // 1) Embedding del query
    const queryEmbedding = await generateEmbedding(query);

    // 2) Recuperación (Vector Search)
    const k = Number.isInteger(topK) && topK > 0 && topK <= 10 ? topK : 4;
    const retrieved = await vectorSearch(queryEmbedding, k);

    // Negación estricta si no hay contexto
    if (!retrieved || retrieved.length === 0) {
      return res.json({ answer: 'No puedo confirmar eso con los documentos proporcionados.', sources: [], confidence: 'baja' });
    }

    // 4) Generación local con LLM
    const answer = await generateResponse(query, retrieved);

    // 5) Fuentes y confianza
    const sources = [...new Set(retrieved.map(r => r.source).filter(Boolean))];
    const avgScore = retrieved.reduce((acc, r) => acc + (r.score ?? 0), 0) / retrieved.length;
    const confidence = avgScore > 0.9 ? 'alta' : avgScore > 0.8 ? 'media' : 'baja';

    // 6) Negación si el modelo la expresa explícitamente
    if (!answer || /no puedo confirmar eso/i.test(answer)) {
      return res.json({ answer: 'No puedo confirmar eso con los documentos proporcionados.', sources: [], confidence: 'baja' });
    }

    return res.json({ answer, sources, confidence });
  } catch (err) {
    console.error('[ERROR /chat]', err);
    return res.status(500).json({ error: 'Error interno procesando la consulta.' });
  }
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.originalUrl}` });
});

// ------------------------------- Arranque -----------------------------------
async function startServer() {
  console.log('🚀 Iniciando microservicio de chatbot documental...');

  // Intentar conectar a MongoDB, pero no abortar si falla
  try {
    await connectToMongoDB();
  } catch (e) {
    console.warn('[WARN] No se pudo conectar a MongoDB. El chatbot arrancará sin base de datos.');
    console.warn('Motivo:', e?.message || e);
  }

  // Inicializar embeddings (si falla, arrancamos igual con negación estricta)
  try {
    await initializeEmbeddingModel();
  } catch (e) {
    console.warn('[WARN] No se pudo cargar el modelo de embeddings. Las respuestas negarán por falta de contexto.');
    console.warn('Motivo:', e?.message || e);
  }

  // Inicializar LLM (COMENTADO PARA ARRANQUE)
  // try {
  //   await initializeLlamaModel();
  // } catch (e) {
  //   console.warn('[WARN] No se pudo cargar el LLM. Se usará modo fallback sin generación neural.');
  //   console.warn('Motivo:', e?.message || e);
  // }

  app.listen(PORT, () => {
    console.log(`[SUCCESS] Microservicio escuchando en http://localhost:${PORT}`);
    console.log('Endpoints: POST /chat, GET /health');
    if (!isDbConnected()) console.log('⚠️  Ejecutando sin conexión a MongoDB (vectorSearch devolverá vacío).');
    if (!embeddingPipeline) console.log('⚠️  Embeddings no disponibles (se devolverá negación).');
    if (!llamaModel) console.log('⚠️  LLM no disponible (respuesta por fallback).');
  });
}

// Invocación con try/catch superior
(async () => {
  try {
    await startServer();
  } catch (e) {
    console.error('\nCRITICAL STARTUP FAILURE');
    console.error(e?.message || e);
    process.exit(1);
  }
})();

// ---------------------------- Cierre Graceful -------------------------------
function shutdown(signal) {
  console.log(`\n${signal} recibido. Cerrando...`);
  mongoose.connection.close(false).then(() => process.exit(0));
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));