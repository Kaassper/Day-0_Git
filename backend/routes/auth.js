// backend/routes/auth.js
const router = require('express').Router();
const User = require('../models/User'); 
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// RUTA: POST /api/auth/register (Registrar un nuevo usuario)
router.post("/register", async (req, res) => {
    try {

        // Obtenemos el email del cuerpo de la petición
        const email = req.body.email;

        // Comprobamos si el email existe y si termina con "@inacapmail.cl"
        if (!email || !email.endsWith('@inacapmail.cl')) {
            // Si no cumple, enviamos un error 400 (Bad Request)
            return res.status(400).json({ message: "Registro fallido: El correo debe ser @inacapmail.cl" });
        }
        // --- FIN DE LA VALIDACIÓN ---


        // 1. Encriptar la contraseña
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(req.body.password, salt);

        // 2. Crear el nuevo usuario
        const newUser = new User({
            username: req.body.username,
            email: req.body.email, // El email que ya validamos
            password: hashedPassword,
        });

        // 3. Guardar usuario en MongoDB
        const user = await newUser.save();
        res.status(201).json(user); // 201 = Creado con éxito

    } catch (err) {
        // (Este 'catch' también atrapará errores si el email o user ya existen,
        //  gracias a la propiedad 'unique' en tu modelo User.js)
        res.status(500).json(err);
    }
});

// RUTA: POST /api/auth/login (Iniciar sesión)
router.post("/login", async (req, res) => {
    try {
        // 1. Encontrar al usuario por su email
        const user = await User.findOne({ email: req.body.email });
        if (!user) {
            // Error genérico por seguridad
            return res.status(401).json({ message: "Email o contraseña incorrecta" });
        }

        // 2. Comparar la contraseña que nos envían con la de la BD
        const validPassword = await bcrypt.compare(req.body.password, user.password);
        if (!validPassword) {
            // Error genérico por seguridad
            return res.status(401).json({ message: "Email o contraseña incorrecta" });
        }

        // 3. Si todo está bien, crear y firmar un Token (JWT)
        const accessToken = jwt.sign(
            { id: user._id, username: user.username },
            process.env.JWT_SECRET, // ¡Asegúrate de que JWT_SECRET esté en tu .env!
            { expiresIn: "3d" } // El token expira en 3 días
        );

        // 4. Enviar respuesta exitosa con el token y los datos del usuario
        const { password, ...others } = user._doc; // Quitamos el password de la respuesta
        res.status(200).json({ ...others, accessToken });

    } catch (err) {
        res.status(500).json(err); // Error de servidor
    }
});

module.exports = router;