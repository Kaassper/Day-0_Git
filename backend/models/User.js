// backend/models/User.js
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true }, // Aquí guardamos la contraseña encriptada
    
    // Perfil
    puntos: { type: Number, default: 0 },
    bio: { type: String, default: "" },

    // Estadísticas
    rutas_completas: [{ type: String }], // Puedes usar [Schema.Types.ObjectId, ref: 'Ruta'] si tienes un modelo Ruta
    rutas_en_progreso: [{ type: String }],

}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);