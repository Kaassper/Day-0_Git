// backend/middleware/auth.js
const jwt = require('jsonwebtoken');

const auth = (req, res, next) => {
    // 1. Busca el token en el header 'Authorization'
    const authHeader = req.header('Authorization');
    
    if (!authHeader) {
        return res.status(401).json({ message: 'Acceso denegado. No hay token.' });
    }

    try {
        // 2. Separa "Bearer <token>"
        const token = authHeader.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ message: 'Formato de token inválido.' });
        }

        // 3. Verifica el token con tu clave secreta
        const verified = jwt.verify(token, process.env.JWT_SECRET);
        
        // 4. Añade los datos del usuario (ej. su ID) a la petición
        req.user = verified; 
        
        next(); // 5. Pasa a la siguiente función (la ruta de la misión)
    } catch (err) {
        res.status(400).json({ message: 'Token inválido.' });
    }
};

module.exports = auth;