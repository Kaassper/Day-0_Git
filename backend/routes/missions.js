// backend/routes/missions.js
const router = require('express').Router();
const User = require('../models/User'); 
const authMiddleware = require('../middleware/auth'); // Importamos el "guardia"

/*
 * RUTA: POST /api/missions/complete
 * PROPOSITO: Marcar una misión como completada y sumar puntos.
 * PROTEGIDA: Sí (necesita token)
*/
router.post("/complete", authMiddleware, async (req, res) => {
    
    try {
        // 1. Obtenemos el ID del usuario desde el token (gracias al middleware)
        const userId = req.user.id; 
        
        // 2. Obtenemos los datos que envió el frontend
        const { missionName, pointsToAdd } = req.body;

        if (!missionName || pointsToAdd === undefined) {
            return res.status(400).json({ message: "Faltan datos (missionName o pointsToAdd)." });
        }

        // 3. Buscamos al usuario en la BD
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "Usuario no encontrado." });
        }

        // 4. Actualizamos sus puntos y misiones completadas
        user.puntos += pointsToAdd;
        
        // (Usamos el campo 'rutas_completas' que ya tenías en tu modelo)
        if (!user.rutas_completas.includes(missionName)) {
            user.rutas_completas.push(missionName);
        }

        // 5. Guardamos los cambios en la BD
        const updatedUser = await user.save();

        // 6. Enviamos la respuesta de éxito al frontend
        res.status(200).json({ 
            message: "¡Misión completada!",
            newPoints: updatedUser.puntos,
            completedMissions: updatedUser.rutas_completas
        });

    } catch (err) {
        console.error("Error en /api/missions/complete:", err);
        res.status(500).json(err);
    }
});

module.exports = router;