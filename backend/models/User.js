const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    puntos: { type: Number, default: 0 },
    
    // Esta es la línea que cambiamos para arreglar el array
    rutas_completas: { type: [String], default: [] }

}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);