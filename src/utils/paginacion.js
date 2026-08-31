/**
 * Utilidad para centralizar la lógica de paginación en el backend.
 */

/**
 * Calcula el offset (skip) y el límite para una consulta paginada.
 * @param {number|string} pagina - El número de página actual (base 1).
 * @param {number|string} limite - La cantidad de elementos por página.
 * @returns {{ skip: number, take: number, page: number, limit: number }}
 */
function calcularPaginacion(pagina, limite) {
    const p = Math.max(1, parseInt(pagina) || 1);
    const l = Math.max(1, parseInt(limite) || 10);

    return {
        skip: (p - 1) * l,
        take: l,
        page: p,
        limit: l
    };
}

/**
 * Calcula el total de páginas basándose en el total de registros y el límite por página.
 * @param {number} total - Total de registros encontrados.
 * @param {number|string} limite - La cantidad de elementos por página.
 * @returns {number}
 */
function calcularTotalPaginas(total, limite) {
    const l = Math.max(1, parseInt(limite) || 10);
    return Math.ceil(total / l);
}

module.exports = {
    calcularPaginacion,
    calcularTotalPaginas
};
