// Archivo: 02_generate_embeddings.js
// Lenguaje: Node.js (JavaScript moderno).
// Dependencias instaladas: 'dotenv', '@xenova/transformers', 'mongoose', 'fs', 'path'.
// Archivo de entrada: './data/chunks.json'

// Carga las variables de entorno desde .env
require('dotenv').config();

// Importación de módulos necesarios
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { pipeline } = require('@xenova/transformers');

// Configuración de rutas y parámetros
const CHUNKS_FILE = './data/chunks.json';
const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';
const COLLECTION_NAME = 'knowledge';

// Variables de entorno
const MONGO_URI = process.env.MONGO_URI;
const MONGO_DB = process.env.MONGO_DB || 'knowledge_base_db';

/**
 * Esquema de Mongoose para la colección 'knowledge'
 */
const knowledgeSchema = new mongoose.Schema({
    _id: {
        type: String,
        required: true
    },
    source: {
        type: String,
        required: true
    },
    index: {
        type: Number,
        required: true
    },
    text: {
        type: String,
        required: true
    },
    embedding: {
        type: [Number],
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, {
    collection: COLLECTION_NAME,
    _id: false // Usamos nuestro propio _id
});

// Crear el modelo
const Knowledge = mongoose.model('Knowledge', knowledgeSchema);

/**
 * Función para conectar a MongoDB
 */
async function connectToMongoDB() {
    try {
        if (!MONGO_URI) {
            throw new Error('MONGO_URI no está definida en las variables de entorno');
        }

        console.log('🔌 Conectando a MongoDB Atlas...');
        
        await mongoose.connect(MONGO_URI, {
            dbName: MONGO_DB,
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        
        console.log(`✅ Conexión exitosa a la base de datos: ${MONGO_DB}`);
        
    } catch (error) {
        throw new Error(`Error al conectar con MongoDB: ${error.message}`);
    }
}

/**
 * Función para limpiar la colección 'knowledge'
 */
async function cleanCollection() {
    try {
        console.log(`🧹 Limpiando colección '${COLLECTION_NAME}'...`);
        
        // Eliminar toda la colección si existe
        await mongoose.connection.db.dropCollection(COLLECTION_NAME);
        console.log(`✅ Colección '${COLLECTION_NAME}' eliminada exitosamente`);
        
    } catch (error) {
        // Si la colección no existe, no es un error crítico
        if (error.message.includes('ns not found')) {
            console.log(`ℹ️  La colección '${COLLECTION_NAME}' no existía previamente`);
        } else {
            throw new Error(`Error al limpiar la colección: ${error.message}`);
        }
    }
}

/**
 * Función para cargar los chunks desde el archivo JSON
 */
function loadChunks() {
    try {
        console.log(`📂 Cargando chunks desde: ${CHUNKS_FILE}`);
        
        if (!fs.existsSync(CHUNKS_FILE)) {
            throw new Error(`El archivo ${CHUNKS_FILE} no existe`);
        }
        
        const chunksData = fs.readFileSync(CHUNKS_FILE, 'utf8');
        const chunks = JSON.parse(chunksData);
        
        if (!Array.isArray(chunks)) {
            throw new Error('El archivo chunks.json no contiene un array válido');
        }
        
        console.log(`✅ Cargados ${chunks.length} chunks exitosamente`);
        return chunks;
        
    } catch (error) {
        throw new Error(`Error al cargar chunks: ${error.message}`);
    }
}

/**
 * Función para inicializar el modelo de embeddings
 */
async function initializeEmbeddingModel() {
    try {
        console.log(`🤖 Inicializando modelo de embeddings: ${MODEL_NAME}`);
        console.log('⏳ Descargando modelo (puede tomar unos minutos en la primera ejecución)...');
        
        // Crear el pipeline para feature extraction
        const embedder = await pipeline('feature-extraction', MODEL_NAME);
        
        console.log(`✅ Modelo ${MODEL_NAME} inicializado correctamente`);
        return embedder;
        
    } catch (error) {
        throw new Error(`Error al inicializar el modelo: ${error.message}`);
    }
}

/**
 * Función para generar embedding de un texto usando mean pooling
 * @param {Object} embedder - Pipeline de embeddings
 * @param {string} text - Texto para generar embedding
 * @returns {Array<number>} Vector de embedding
 */
async function generateEmbedding(embedder, text) {
    try {
        // Generar embeddings usando el modelo
        const output = await embedder(text, { pooling: 'mean', normalize: true });
        
        // Convertir el tensor a array de números
        const embedding = Array.from(output.data);
        
        return embedding;
        
    } catch (error) {
        throw new Error(`Error al generar embedding: ${error.message}`);
    }
}

/**
 * Función para procesar chunks en lotes
 * @param {Array} chunks - Array de chunks
 * @param {Object} embedder - Pipeline de embeddings
 * @param {number} batchSize - Tamaño del lote
 */
async function processChunksInBatches(chunks, embedder, batchSize = 10) {
    const totalChunks = chunks.length;
    const documents = [];
    
    console.log(`📊 Procesando ${totalChunks} chunks en lotes de ${batchSize}...`);
    
    for (let i = 0; i < totalChunks; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        const batchNumber = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(totalChunks / batchSize);
        
        console.log(`⚙️  Procesando lote ${batchNumber}/${totalBatches} (${batch.length} chunks)...`);
        
        // Procesar cada chunk en el lote
        for (const chunk of batch) {
            try {
                // Validar que el chunk tiene la estructura esperada
                if (!chunk._id || !chunk.text || chunk.source === undefined || chunk.index === undefined) {
                    console.warn(`⚠️  Chunk inválido encontrado: ${chunk._id || 'ID no definido'}`);
                    continue;
                }
                
                // Generar embedding del texto
                const embedding = await generateEmbedding(embedder, chunk.text);
                
                // Crear documento para MongoDB
                const document = {
                    _id: chunk._id,
                    source: chunk.source,
                    index: chunk.index,
                    text: chunk.text,
                    embedding: embedding,
                    createdAt: new Date()
                };
                
                documents.push(document);
                
                // Mostrar progreso cada 5 chunks
                if (documents.length % 5 === 0) {
                    console.log(`   📝 Procesados ${documents.length}/${totalChunks} chunks`);
                }
                
            } catch (error) {
                console.error(`❌ Error procesando chunk ${chunk._id}: ${error.message}`);
                continue;
            }
        }
        
        // Pequeña pausa entre lotes para no sobrecargar el sistema
        if (i + batchSize < totalChunks) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
    
    console.log(`✅ Generación de embeddings completada: ${documents.length}/${totalChunks} chunks procesados exitosamente`);
    return documents;
}

/**
 * Función para insertar documentos en MongoDB
 * @param {Array} documents - Array de documentos a insertar
 */
async function insertDocuments(documents) {
    try {
        if (documents.length === 0) {
            console.log('⚠️  No hay documentos para insertar');
            return;
        }
        
        console.log(`💾 Insertando ${documents.length} documentos en la colección '${COLLECTION_NAME}'...`);
        
        // Insertar documentos en lotes para mejor rendimiento
        const batchSize = 50;
        let insertedCount = 0;
        
        for (let i = 0; i < documents.length; i += batchSize) {
            const batch = documents.slice(i, i + batchSize);
            
            try {
                await Knowledge.insertMany(batch, { ordered: false });
                insertedCount += batch.length;
                
                console.log(`   💾 Insertados ${insertedCount}/${documents.length} documentos`);
                
            } catch (error) {
                // Manejar errores de inserción sin detener el proceso
                console.warn(`⚠️  Error en lote de inserción: ${error.message}`);
                // Intentar insertar uno por uno en caso de errores
                for (const doc of batch) {
                    try {
                        await Knowledge.create(doc);
                        insertedCount++;
                    } catch (docError) {
                        console.error(`❌ Error insertando documento ${doc._id}: ${docError.message}`);
                    }
                }
            }
        }
        
        console.log(`✅ Inserción completada: ${insertedCount} documentos insertados en la base de datos`);
        
        // Verificar el número total de documentos en la colección
        const totalDocs = await Knowledge.countDocuments();
        console.log(`📊 Total de documentos en la colección '${COLLECTION_NAME}': ${totalDocs}`);
        
    } catch (error) {
        throw new Error(`Error al insertar documentos: ${error.message}`);
    }
}

/**
 * Función para mostrar estadísticas finales
 * @param {Array} documents - Documentos procesados
 */
function showFinalStatistics(documents) {
    if (documents.length === 0) return;
    
    // Calcular estadísticas de embeddings
    const embeddingLengths = documents.map(doc => doc.embedding.length);
    const avgEmbeddingLength = Math.round(embeddingLengths.reduce((a, b) => a + b, 0) / embeddingLengths.length);
    
    // Estadísticas por fuente
    const sourceStats = {};
    documents.forEach(doc => {
        if (!sourceStats[doc.source]) {
            sourceStats[doc.source] = 0;
        }
        sourceStats[doc.source]++;
    });
    
    console.log(`\n📈 Estadísticas Finales:`);
    console.log(`   • Total de documentos procesados: ${documents.length}`);
    console.log(`   • Dimensiones del vector embedding: ${avgEmbeddingLength}`);
    console.log(`   • Fuentes procesadas: ${Object.keys(sourceStats).length}`);
    console.log(`   • Modelo utilizado: ${MODEL_NAME}`);
    console.log(`   • Base de datos: ${MONGO_DB}`);
    console.log(`   • Colección: ${COLLECTION_NAME}`);
    
    console.log(`\n📊 Distribución por fuente:`);
    Object.entries(sourceStats)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5) // Mostrar solo las top 5
        .forEach(([source, count]) => {
            const shortSource = source.length > 50 ? source.substring(0, 47) + '...' : source;
            console.log(`   • ${shortSource}: ${count} chunks`);
        });
}

/**
 * Función principal del script
 */
async function main() {
    console.log('🚀 Iniciando generación e ingesta de embeddings vectoriales...\n');
    
    try {
        // 1. Conectar a MongoDB
        await connectToMongoDB();
        
        // 2. Limpiar colección existente
        await cleanCollection();
        
        // 3. Cargar chunks desde el archivo JSON
        const chunks = loadChunks();
        
        // 4. Inicializar modelo de embeddings
        const embedder = await initializeEmbeddingModel();
        
        // 5. Procesar chunks y generar embeddings
        const documents = await processChunksInBatches(chunks, embedder);
        
        // 6. Insertar documentos en MongoDB
        await insertDocuments(documents);
        
        // 7. Mostrar estadísticas finales
        showFinalStatistics(documents);
        
        console.log('\n🎉 ¡Proceso completado exitosamente!');
        console.log('💡 Los embeddings han sido generados e insertados en MongoDB Atlas');
        
    } catch (error) {
        console.error(`❌ Error crítico en el proceso: ${error.message}`);
        process.exit(1);
        
    } finally {
        // Cerrar conexión a MongoDB
        try {
            await mongoose.connection.close();
            console.log('🔌 Conexión a MongoDB cerrada');
        } catch (closeError) {
            console.warn('⚠️  Error al cerrar conexión:', closeError.message);
        }
    }
}

// Ejecutar el script solo si se ejecuta directamente
if (require.main === module) {
    main().catch(error => {
        console.error('❌ Error inesperado:', error);
        process.exit(1);
    });
}

// Exportar funciones para uso en otros módulos si es necesario
module.exports = {
    connectToMongoDB,
    cleanCollection,
    loadChunks,
    initializeEmbeddingModel,
    generateEmbedding,
    processChunksInBatches,
    insertDocuments,
    main
};
