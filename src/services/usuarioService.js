// Logica de negocio relacionada a los usuarios
const crypto = require("node:crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const prisma = require("../config/prisma");
const mailService = require("./mailService");
const { validarFormatoDni, obtenerVariantesDni } = require("../utils/dni");

const DURACION_TOKEN_RECUPERACION_MS = 60 * 60 * 1000;

function crearErrorTokenRecuperacion() {
    const error = new Error("El enlace de recuperación no es válido o venció.");
    error.status = 400;
    return error;
}

function obtenerHashToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
}

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
            dni: usuario.dni,
            email: usuario.email,
            rol: usuario.rol.nombre
        }
    };
}

async function solicitarRecuperacionContrasena(email) {
    const usuario = await prisma.usuario.findUnique({
        where: { email },
        select: {
            id: true,
            rol: { select: { nombre: true } }
        }
    });

    if (!usuario || usuario.rol.nombre !== "Cliente") {
        return;
    }

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = obtenerHashToken(token);
    const venceEn = new Date(Date.now() + DURACION_TOKEN_RECUPERACION_MS);

    await prisma.recuperacionContrasena.deleteMany({
        where: { usuarioId: usuario.id }
    });

    const recuperacion = await prisma.recuperacionContrasena.create({
        data: { usuarioId: usuario.id, tokenHash, venceEn }
    });

    try {
        await mailService.enviarCorreoRecuperacionContrasena(email, token);
    } catch (error) {
        console.error("No se pudo enviar el correo de recuperación:", error.message);
        await prisma.recuperacionContrasena.deleteMany({
            where: { id: recuperacion.id }
        });
    }
}

async function restablecerContrasena(token, contrasena) {
    const tokenHash = obtenerHashToken(token);
    const ahora = new Date();
    const recuperacion = await prisma.recuperacionContrasena.findUnique({
        where: { tokenHash },
        select: { id: true, usuarioId: true, venceEn: true }
    });

    if (!recuperacion || recuperacion.venceEn <= ahora) {
        throw crearErrorTokenRecuperacion();
    }

    const contrasenaEncriptada = await bcrypt.hash(contrasena, 10);

    await prisma.$transaction(async (transaccion) => {
        const tokenConsumido = await transaccion.recuperacionContrasena.deleteMany({
            where: {
                id: recuperacion.id,
                venceEn: { gt: ahora }
            }
        });

        if (tokenConsumido.count !== 1) {
            throw crearErrorTokenRecuperacion();
        }

        await transaccion.usuario.update({
            where: { id: recuperacion.usuarioId },
            data: { contrasena: contrasenaEncriptada }
        });
    });
}

async function obtenerPerfilUsuario(usuarioId) {
    const usuario = await prisma.usuario.findUnique({
        where: { id: usuarioId },
        select: {
            id: true,
            nombre: true,
            apellido: true,
            dni: true,
            email: true,
            rol: { select: { nombre: true } }
        }
    });

    if (!usuario) {
        const error = new Error("Usuario no encontrado");
        error.status = 404;
        throw error;
    }

    return {
        id: usuario.id,
        nombre: usuario.nombre,
        apellido: usuario.apellido,
        dni: usuario.dni,
        email: usuario.email,
        rol: usuario.rol.nombre
    };
}

async function actualizarPerfilUsuario(usuarioId, datos) {
    const usuario = await prisma.usuario.findUnique({
        where: { id: usuarioId },
        select: { id: true }
    });

    if (!usuario) {
        const error = new Error("Usuario no encontrado");
        error.status = 404;
        throw error;
    }

    // Lista blanca de campos editables. Aunque el esquema ya rechaza otros
    // campos, se vuelve a filtrar aca para no depender de una sola capa.
    const cambios = {};
    ["nombre", "apellido", "dni", "email"].forEach(function (campo) {
        if (datos[campo] !== undefined) {
            cambios[campo] = datos[campo];
        }
    });

    if (Object.keys(cambios).length === 0) {
        const error = new Error("Debés enviar al menos un dato para actualizar");
        error.status = 400;
        throw error;
    }

    if (cambios.email) {
        const emailEnUso = await prisma.usuario.findFirst({
            where: {
                id: { not: usuarioId },
                email: { equals: cambios.email, mode: "insensitive" }
            },
            select: { id: true }
        });

        if (emailEnUso) {
            const error = new Error("El email ya está en uso por otro usuario");
            error.status = 409;
            throw error;
        }
    }

    if (cambios.dni) {
        const dniEnUso = await prisma.usuario.findFirst({
            where: {
                id: { not: usuarioId },
                dni: { in: obtenerVariantesDni(cambios.dni) }
            },
            select: { id: true }
        });

        if (dniEnUso) {
            const error = new Error("El DNI ya está en uso por otro usuario");
            error.status = 409;
            throw error;
        }
    }

    let usuarioActualizado;

    try {
        usuarioActualizado = await prisma.usuario.update({
            where: { id: usuarioId },
            data: cambios,
            select: {
                id: true,
                nombre: true,
                apellido: true,
                dni: true,
                email: true,
                rol: { select: { nombre: true } }
            }
        });
    } catch (error) {
        // Protege ante una condicion de carrera contra los indices unicos.
        if (error.code === "P2002") {
            const errorConflicto = new Error("El email o el DNI ya están en uso por otro usuario");
            errorConflicto.status = 409;
            throw errorConflicto;
        }
        throw error;
    }

    return {
        id: usuarioActualizado.id,
        nombre: usuarioActualizado.nombre,
        apellido: usuarioActualizado.apellido,
        dni: usuarioActualizado.dni,
        email: usuarioActualizado.email,
        rol: usuarioActualizado.rol.nombre
    };
}

async function cambiarContrasenaUsuario(usuarioId, datos) {
    const usuario = await prisma.usuario.findUnique({
        where: { id: usuarioId },
        select: { id: true, contrasena: true }
    });

    if (!usuario) {
        const error = new Error("Usuario no encontrado");
        error.status = 404;
        throw error;
    }

    const contrasenaActualValida = await bcrypt.compare(
        datos.contrasenaActual,
        usuario.contrasena
    );

    if (!contrasenaActualValida) {
        const error = new Error("La contraseña actual no es correcta");
        error.status = 400;
        throw error;
    }

    const contrasenaEncriptada = await bcrypt.hash(datos.contrasenaNueva, 10);

    await prisma.usuario.update({
        where: { id: usuarioId },
        data: { contrasena: contrasenaEncriptada }
    });
}

async function obtenerClientePorDni(dni) {
    if (!dni || typeof dni !== "string" || !dni.trim()) {
        const error = new Error("El DNI es obligatorio");
        error.status = 400;
        throw error;
    }

    if (!validarFormatoDni(dni)) {
        const error = new Error("El formato del DNI no es válido");
        error.status = 400;
        throw error;
    }

    const cliente = await prisma.usuario.findFirst({
        where: {
            OR: obtenerVariantesDni(dni).map((dniVariante) => ({ dni: dniVariante })),
            rol: {
                nombre: "Cliente"
            }
        },
        select: {
            id: true,
            nombre: true,
            apellido: true,
            dni: true,
            email: true
        }
    });

    if (!cliente) {
        const error = new Error("No se encontró ningún cliente con el DNI ingresado");
        error.status = 404;
        throw error;
    }

    return {
        id: cliente.id,
        nombre: cliente.nombre,
        apellido: cliente.apellido,
        dni: cliente.dni,
        email: cliente.email
    };
}

module.exports = {
    registrarUsuario,
    iniciarSesion,
    solicitarRecuperacionContrasena,
    restablecerContrasena,
    obtenerPerfilUsuario,
    actualizarPerfilUsuario,
    cambiarContrasenaUsuario,
    obtenerClientePorDni
};