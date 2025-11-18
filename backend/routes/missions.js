const router = require('express').Router();
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');

/*
 * RUTA: POST /api/missions/complete
 */
router.post("/complete", authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id; 
        const { missionName, pointsToAdd } = req.body;

        // 1. ESPÍA: ¿Qué misión llega?
        console.log("--- INTENTO DE MISIÓN ---");
        console.log("Misión recibida:", missionName);

        if (!missionName || pointsToAdd === undefined) {
            return res.status(400).json({ message: "Faltan datos." });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "Usuario no encontrado." });
        }
        
        // 2. ESPÍA: ¿Qué tiene el usuario guardado?
        console.log("Historial del usuario:", user.rutas_completas);

        // 3. LA PRUEBA DE FUEGO (Control de duplicados)
        // Nos aseguramos de comparar texto con texto
        const yaExiste = user.rutas_completas.includes(missionName);
        console.log("¿Ya existe?:", yaExiste);

        if (yaExiste) {
            console.log("⛔ BLOQUEADO: Misión duplicada");
            return res.status(409).json({ 
                message: "¡Ya completaste esta misión anteriormente! No se sumaron puntos extra." 
            });
        }

        console.log("✅ ACEPTADO: Sumando puntos...");
        
        // Sumar puntos
        user.puntos += pointsToAdd;
        
        // Agregar misión al historial
        user.rutas_completas.push(missionName);

        const updatedUser = await user.save();

        res.status(200).json({ 
            message: "¡Misión completada!",
            newPoints: updatedUser.puntos,
            completedMissions: updatedUser.rutas_completas
        });

    } catch (err) {
        console.error("ERROR EN EL SERVIDOR:", err);
        res.status(500).json(err);
    }
});

module.exports = router;