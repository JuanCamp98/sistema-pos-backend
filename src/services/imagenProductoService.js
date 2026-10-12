const { randomUUID } = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const directorioImagenes = path.resolve(__dirname, "../../uploads/productos");

async function guardarImagenProducto(imagen) {
    await fs.mkdir(directorioImagenes, { recursive: true });
    const nombre = randomUUID() + imagen.extension;
    const rutaFisica = path.join(directorioImagenes, nombre);
    await fs.writeFile(rutaFisica, imagen.buffer, { flag: "wx" });
    return {
        ruta: "/uploads/productos/" + nombre,
        rutaFisica: rutaFisica
    };
}

async function eliminarImagenProducto(ruta) {
    const prefijo = "/uploads/productos/";
    if (typeof ruta !== "string" || !ruta.startsWith(prefijo)) return;

    const nombre = ruta.slice(prefijo.length);
    if (!nombre || path.basename(nombre) !== nombre) return;

    await fs.unlink(path.join(directorioImagenes, nombre));
}

module.exports = { guardarImagenProducto, eliminarImagenProducto };
