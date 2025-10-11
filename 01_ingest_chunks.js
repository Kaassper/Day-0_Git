// Archivo: 01_ingest_chunks.js
// Lenguaje: Node.js (JavaScript moderno).
// Dependencias instaladas: 'pdf-parse', 'dotenv', 'fs', 'path'.

// Carga las variables de entorno desde .env
require('dotenv').config();

// Importación de módulos necesarios
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

// Configuración de directorios
const PDF_DIR = './data/pdfs';
const OUTPUT_FILE = './data/chunks.json';
const CHUNK_SIZE = 400; // Palabras por chunk
const OVERLAP_SIZE = 50; // Palabras de solapamiento

/**
 * Función para dividir texto en chunks con solapamiento
 * @param {string} text - Texto a dividir
 * @param {number} chunkSize - Tamaño del chunk en palabras
 * @param {number} overlapSize - Tamaño del solapamiento en palabras
 * @returns {Array<string>} Array de chunks de texto
 */
function createChunks(text, chunkSize = CHUNK_SIZE, overlapSize = OVERLAP_SIZE) {
    // Limpiar el texto y dividir en palabras
    const words = text
        .replace(/\s+/g, ' ') // Normalizar espacios en blanco
        .trim()
        .split(' ')
        .filter(word => word.length > 0);

    if (words.length === 0) return [];

    const chunks = [];
    let currentIndex = 0;

    while (currentIndex < words.length) {
        // Determinar el final del chunk actual
        const endIndex = Math.min(currentIndex + chunkSize, words.length);
        
        // Crear el chunk actual
        const chunk = words.slice(currentIndex, endIndex).join(' ');
        chunks.push(chunk);

        // Si llegamos al final del texto, salir del bucle
        if (endIndex >= words.length) break;

        // Calcular el siguiente índice de inicio con solapamiento
        currentIndex = endIndex - overlapSize;
        
        // Asegurar que no retrocedamos
        if (currentIndex <= chunks.length > 1 ? currentIndex : 0) {
            currentIndex = endIndex;
        }
    }

    return chunks;
}

/**
 * Función para extraer texto de un archivo PDF
 * @param {string} filePath - Ruta completa al archivo PDF
 * @returns {Promise<string>} Texto extraído del PDF
 */
async function extractTextFromPDF(filePath) {
    try {
        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdfParse(dataBuffer);
        return data.text;
    } catch (error) {
        throw new Error(`Error al procesar PDF ${filePath}: ${error.message}`);
    }
}

/**
 * Función para generar ID único para cada chunk
 * @param {string} filename - Nombre del archivo sin extensión
 * @param {number} index - Índice del chunk
 * @returns {string} ID único en formato "{filename}::chunk_{index}"
 */
function generateChunkId(filename, index) {
    // Remover la extensión .pdf del nombre del archivo
    const nameWithoutExt = filename.replace(/\.pdf$/i, '');
    return `${nameWithoutExt}::chunk_${index}`;
}

/**
 * Función principal para procesar todos los PDFs
 */
async function processAllPDFs() {
    console.log('🚀 Iniciando procesamiento de documentos PDF...\n');

    try {
        // Verificar que el directorio de PDFs existe
        if (!fs.existsSync(PDF_DIR)) {
            throw new Error(`El directorio ${PDF_DIR} no existe`);
        }

        // Leer todos los archivos PDF del directorio
        const files = fs.readdirSync(PDF_DIR)
            .filter(file => file.toLowerCase().endsWith('.pdf'));

        if (files.length === 0) {
            console.log('⚠️  No se encontraron archivos PDF en el directorio');
            return;
        }

        console.log(`📁 Encontrados ${files.length} archivos PDF para procesar\n`);

        // Array para almacenar todos los chunks
        const allChunks = [];
        let totalChunks = 0;

        // Procesar cada archivo PDF
        for (const file of files) {
            const filePath = path.join(PDF_DIR, file);
            console.log(`📄 Procesando: ${file}...`);

            try {
                // Extraer texto del PDF
                const text = await extractTextFromPDF(filePath);
                
                if (!text || text.trim().length === 0) {
                    console.log(`⚠️  El archivo ${file} no contiene texto extraíble`);
                    continue;
                }

                // Crear chunks del texto
                const chunks = createChunks(text);
                
                // Crear objetos de chunk con metadatos
                chunks.forEach((chunkText, index) => {
                    const chunkObject = {
                        _id: generateChunkId(file, index),
                        source: file,
                        index: index,
                        text: chunkText
                    };
                    allChunks.push(chunkObject);
                });

                totalChunks += chunks.length;
                console.log(`✅ ${file}: ${chunks.length} chunks generados`);

            } catch (error) {
                console.error(`❌ Error procesando ${file}: ${error.message}`);
                continue;
            }
        }

        // Crear el directorio de salida si no existe
        const outputDir = path.dirname(OUTPUT_FILE);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        // Guardar todos los chunks en el archivo JSON
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allChunks, null, 2), 'utf8');

        console.log(`\n🎉 Procesamiento completado exitosamente!`);
        console.log(`📊 Total de chunks generados: ${totalChunks}`);
        console.log(`💾 Archivo de salida: ${OUTPUT_FILE}`);
        console.log(`📦 Total de objetos en el archivo: ${allChunks.length}`);

    } catch (error) {
        console.error(`❌ Error crítico durante el procesamiento: ${error.message}`);
        process.exit(1);
    }
}

/**
 * Función para mostrar estadísticas de los chunks generados
 */
function showStatistics(chunks) {
    if (chunks.length === 0) return;

    const wordCounts = chunks.map(chunk => chunk.text.split(' ').length);
    const avgWords = Math.round(wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length);
    const minWords = Math.min(...wordCounts);
    const maxWords = Math.max(...wordCounts);

    console.log(`\n📈 Estadísticas de chunks:`);
    console.log(`   • Promedio de palabras por chunk: ${avgWords}`);
    console.log(`   • Mínimo de palabras: ${minWords}`);
    console.log(`   • Máximo de palabras: ${maxWords}`);
}

// Ejecutar el script solo si se ejecuta directamente
if (require.main === module) {
    processAllPDFs()
        .then(() => {
            // Mostrar estadísticas adicionales si el archivo se generó correctamente
            if (fs.existsSync(OUTPUT_FILE)) {
                try {
                    const chunks = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
                    showStatistics(chunks);
                } catch (error) {
                    console.log('⚠️  No se pudieron cargar las estadísticas');
                }
            }
        })
        .catch(error => {
            console.error('❌ Error inesperado:', error);
            process.exit(1);
        });
}

// Exportar funciones para uso en otros módulos si es necesario
module.exports = {
    processAllPDFs,
    createChunks,
    extractTextFromPDF,
    generateChunkId
};
