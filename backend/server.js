// backend/server.js  (Versión REAL restaurada)

// --- 1. Importaciones ---
const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors'); // Para permitir peticiones del frontend
const authRoute = require('./routes/auth'); // Importamos nuestras rutas de login

// --- 2. Configuración Inicial ---
dotenv.config(); // Carga las variables del .env
const app = express();
app.use(express.json()); // Permite que el servidor entienda JSON
app.use(cors()); // Permite que tu frontend se conecte


// --- 3. Conexión a MongoDB Atlas ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log("✅ ¡Conexión a MongoDB Atlas exitosa!");
    })
    .catch((err) => {
        console.error("❌ FALLÓ LA CONEXIÓN A MONGODB:", err);
    });

// --- 4. Definición de Rutas ---

// Todo lo que vaya a "/api/auth" usará las reglas de 'authRoute'
app.use("/api/auth", authRoute);

// --- 5. Iniciar el Servidor ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Backend corriendo en el puerto ${PORT}`);
});