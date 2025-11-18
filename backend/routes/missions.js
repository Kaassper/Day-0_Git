// backend/routes/missions.js (Versión de Diagnóstico)

router.post("/complete", authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id; 
        const { missionName, pointsToAdd } = req.body;

        // 1. ESPÍA: ¿Qué misión llega?
        console.log("--- INTENTO DE MISIÓN ---");
        console.log("Misión recibida:", missionName);

        const user = await User.findById(userId);
        
        // 2. ESPÍA: ¿Qué tiene el usuario guardado?
        console.log("Historial del usuario:", user.rutas_completas);

        // 3. LA PRUEBA DE FUEGO
        const yaExiste = user.rutas_completas.includes(missionName);
        console.log("¿Ya existe?:", yaExiste);

        if (yaExiste) {
            console.log("⛔ BLOQUEADO: Misión duplicada");
            return res.status(409).json({ 
                message: "¡Ya completaste esta misión anteriormente! No se sumaron puntos extra." 
            });
        }

        console.log("✅ ACEPTADO: Sumando puntos...");
        user.puntos += pointsToAdd;
        user.rutas_completas.push(missionName);

        const updatedUser = await user.save();
        res.status(200).json({ 
            message: "¡Misión completada!",
            newPoints: updatedUser.puntos
        });

    } catch (err) {
        console.error(err);
        res.status(500).json(err);
    }
});