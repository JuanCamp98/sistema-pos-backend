// Logica de negocio relacionada a los usuarios
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const prisma = require("../config/prisma");

async function registrarUsuario(datos) {
    const { nombre, apellido, dni, email, contrasena, rol } = datos;

    const rolEncontrado = await prisma.rol.findUnique({
        where: { nombre: rol }
    });

    if (!rolEncontrado) {
        throw new Error("El rol indicado no existe");
    }

    // Buscamos si existe algun usuario que coincida en DNI O Email en una sola consulta
    const usuarioExistente = await prisma.usuario.findFirst({
        where: {
            OR: [
                { email: email },
                { dni: dni }
            ]
        }
    });

    if (usuarioExistente) {
        const error = new Error("Ya existe un usuario registrado con los datos ingresados");
        error.status = 409;
        throw error;
    }

    const contrasenaEncriptada = await bcrypt.hash(contrasena, 10);

    const nuevoUsuario = await prisma.usuario.create({
        data: {
            nombre: nombre,
            apellido: apellido,
            dni: dni,
            email: email,
            contrasena: contrasenaEncriptada,
            rolId: rolEncontrado.id
        }
    });

    return nuevoUsuario;
}

async function iniciarSesion(datos) {
    const { email, contrasena } = datos;

    const usuario = await prisma.usuario.findUnique({
        where: { email: email },
        include: { rol: true }
    });

    if (!usuario) {
        throw new Error("Email o contrasena incorrectos");
    }

    const contrasenaValida = await bcrypt.compare(contrasena, usuario.contrasena);

    if (!contrasenaValida) {
        throw new Error("Email o contrasena incorrectos");
    }

    const token = jwt.sign(
        {
            id: usuario.id,
            rol: usuario.rol.nombre
        },
        process.env.JWT_SECRET,
        { expiresIn: "8h" }
    );

    return {
        token: token,
        usuario: {
            id: usuario.id,
            nombre: usuario.nombre,
            apellido: usuario.apellido,
            email: usuario.email,
            rol: usuario.rol.nombre
        }
    };
}

module.exports = { registrarUsuario, iniciarSesion };