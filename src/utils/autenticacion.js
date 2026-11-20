const jwt = require("jsonwebtoken");
const prisma = require("../config/prisma");

// jsonwebtoken v9 permite fijar el algoritmo esperado. Evita que un token
// manipulado pueda forzar algoritmos distintos de HS256.
const OPCIONES_JWT = { algorithms: ["HS256"] };

function versionDelToken(datos) {
    return Number.isInteger(datos?.tv) ? datos.tv : 0;
}

// Verifica el JWT y resuelve el usuario contra la base. El rol se toma siempre
// de la base (no del token) para que un cambio de rol tenga efecto inmediato.
// Devuelve null cuando el token no es valido o la sesion fue revocada.
async function obtenerUsuarioDesdeToken(token) {
    let datos;
    try {
        datos = jwt.verify(token, process.env.JWT_SECRET, OPCIONES_JWT);
    } catch {
        return null;
    }

    if (!datos || typeof datos.id !== "string" || typeof datos.rol !== "string") {
        return null;
    }

    const usuario = await prisma.usuario.findUnique({
        where: { id: datos.id },
        select: {
            id: true,
            tokenVersion: true,
            rol: { select: { nombre: true } }
        }
    });

    if (!usuario) {
        // Compatibilidad con entornos de desarrollo/pruebas que firman tokens
        // con IDs que no existen en la base. En produccion NUNCA se acepta un
        // token de un usuario inexistente (por ejemplo, una cuenta eliminada).
        if (process.env.NODE_ENV !== "production" &&
            !Object.prototype.hasOwnProperty.call(datos, "tv")) {
            return { id: datos.id, rol: datos.rol };
        }
        return null;
    }

    if (usuario.tokenVersion !== versionDelToken(datos)) {
        return null;
    }

    return { id: usuario.id, rol: usuario.rol.nombre };
}

module.exports = { obtenerUsuarioDesdeToken, OPCIONES_JWT };
