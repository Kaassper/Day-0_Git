const router = require('express').Router();
const User = require('../models/User'); // Asegúrate de que este archivo exista
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto'); // Para generar tokens seguros
const nodemailer = require('nodemailer'); // Para el envío de emails

/*
 * 1. RUTA: POST /api/auth/register (Registrar un nuevo usuario)
 */
router.post("/register", async (req, res) => {
    try {
        // Validación de Email: Solo inacapmail.cl
        const email = req.body.email;
        if (!email || !email.endsWith('@inacapmail.cl')) {
            return res.status(400).json({ message: "Registro fallido: El correo debe ser @inacapmail.cl" });
        }

        // Hashear y Salvar Contraseña
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(req.body.password, salt);

        const newUser = new User({
            username: req.body.username,
            email: req.body.email,
            password: hashedPassword,
        });

        const user = await newUser.save();
        res.status(201).json(user);

    } catch (err) {
        // 11000 es el código de error de MongoDB para "duplicado" (email o username)
        if (err.code === 11000) {
            return res.status(400).json({ message: "El usuario o email ya están registrados." });
        }
        console.error("Error en /register:", err);
        res.status(500).json({ message: "Error interno del servidor al registrar." });
    }
});


/*
 * 2. RUTA: POST /api/auth/login (Iniciar Sesión)
 */
router.post("/login", async (req, res) => {
    try {
        const user = await User.findOne({ email: req.body.email });
        
        // Comprobación de existencia (401 por seguridad)
        if (!user) {
            return res.status(401).json({ message: "Email o contraseña incorrecta" });
        }

        // Comprobación de contraseña
        const validPassword = await bcrypt.compare(req.body.password, user.password);
        if (!validPassword) {
            return res.status(401).json({ message: "Email o contraseña incorrecta" });
        }

        // Generar Token JWT
        const accessToken = jwt.sign(
            { id: user._id, username: user.username },
            process.env.JWT_SECRET,
            { expiresIn: "3d" }
        );

        // Quitar password del objeto de respuesta
        const { password, ...others } = user._doc; 
        res.status(200).json({ ...others, accessToken });

    } catch (err) {
        console.error("Error en /login:", err);
        res.status(500).json({ message: "Error interno del servidor al iniciar sesión." });
    }
});


/*
 * 3. RUTA: POST /api/auth/forgot-password (Generar Token de Recuperación)
 * IMPORTANTE: Verifica que tu modelo User.js tenga los campos resetPasswordToken y resetPasswordExpires.
 */
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });
        
        if (!user) {
            // Se devuelve éxito para evitar dar pistas sobre la existencia del email
            return res.status(200).json({ message: 'Si el email existe, se ha enviado un link.' });
        }

        // Generar token de 64 caracteres
        const token = crypto.randomBytes(32).toString('hex');

        // Guardar el token en la base de datos con expiración (1 hora)
        user.resetPasswordToken = token;
        user.resetPasswordExpires = Date.now() + 3600000; // 1 hora
        await user.save();

        // (SIMULACIÓN DE ENVÍO DE EMAIL)
        const resetUrl = `https://<URL_GITHUB_PAGES>/reset-password.html?token=${token}`;
        
        // --- CÓDIGO REAL DE NODEMAILER (Actualmente comentado para DEV) ---
        /*
        const transporter = nodemailer.createTransport({ service: 'Gmail', auth: { user: 'EMAIL_DE_ENVIO', pass: 'CLAVE_DE_APLICACION' } });
        const mailOptions = { to: user.email, from: 'EMAIL_DE_ENVIO', subject: 'Restablecimiento de Contraseña - Day 0', text: 'Haz clic aquí: ' + resetUrl };
        transporter.sendMail(mailOptions, (err, response) => { if (err) { console.error('ERROR AL ENVIAR CORREO:', err); } });
        */
        
        console.log(`\n\n=== ENLACE DE RECUPERACIÓN GENERADO ===`);
        console.log(`USUARIO: ${email}`);
        console.log(`TOKEN: ${token}`);
        console.log(`LINK (Copiar en navegador para probar): ${resetUrl}`);
        console.log(`========================================\n`);

        res.status(200).json({ message: 'Link de recuperación enviado con éxito.' });

    } catch (error) {
        console.error('ERROR en forgot-password:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
});


/*
 * 4. RUTA: POST /api/auth/reset-password (Verificar Token y Actualizar)
 */
router.post('/reset-password', async (req, res) => {
    try {
        const { token, newPassword } = req.body;
        
        // 1. Buscar al usuario por el token y verificar que NO haya expirado
        const user = await User.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() } 
        });

        if (!user) {
            return res.status(400).json({ message: 'El token es inválido o ha expirado. Intenta de nuevo.' });
        }
        
        // 2. Hashear la nueva contraseña
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        // 3. Actualizar la contraseña y LIMPIAR los campos de recuperación
        user.password = hashedPassword;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        
        await user.save();

        res.status(200).json({ message: 'Contraseña restablecida con éxito.' });

    } catch (error) {
        console.error('ERROR en reset-password:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
});


module.exports = router;