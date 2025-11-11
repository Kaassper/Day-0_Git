const router = require('express').Router();
const User = require('../models/User');
const authMiddleware = require('../middleware/auth'); // El "guardia" que ya creamos

/*
 * RUTA: GET /api/users/me
 * PROPOSITO: Obtener los datos del usuario que está logueado
 * PROTEGIDA: Sí (necesita token)
*/
router.get("/me", authMiddleware, async (req, res) => {
    try {
        // El ID del usuario viene del token (gracias a authMiddleware)
        const userId = req.user.id;
        
        // Buscamos al usuario y quitamos el password de la respuesta
        const user = await User.findById(userId).select("-password");

        if (!user) {
            return res.status(404).json({ message: "Usuario no encontrado." });
        }

        // Enviamos los datos del usuario (incluyendo 'puntos')
        res.status(200).json(user);

    } catch (err) {
        res.status(500).json(err);
    }
});

module.exports = router;