// Normalizacion de nombres visibles (categorias, tipos de producto, productos).
// Se usa para comparar sin distinguir mayusculas/minusculas y para evitar
// duplicados que solo difieren en espacios o en la forma Unicode.
function normalizarNombre(valor) {
    return String(valor ?? "")
        .normalize("NFKC")
        .replace(/\s+/g, " ")
        .trim();
}

// Filtro de Prisma para buscar por nombre sin distinguir mayusculas/minusculas.
// `idExcluido` permite que un registro conserve su propio nombre al editarlo.
function filtroNombre(nombre, idExcluido) {
    return {
        ...(idExcluido ? { id: { not: idExcluido } } : {}),
        nombre: { equals: nombre, mode: "insensitive" }
    };
}

module.exports = { normalizarNombre, filtroNombre };
