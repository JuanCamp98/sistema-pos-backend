function normalizarDni(dni) {
    return dni.trim().replace(/\./g, "");
}

function validarFormatoDni(dni) {
    if (typeof dni !== "string") return false;
    const dniTrimmed = dni.trim();
    return /^\d{7,8}$/.test(dniTrimmed) || /^\d{1,2}(?:\.\d{3}){2}$/.test(dniTrimmed);
}

function obtenerVariantesDni(dni) {
    const dniLimpio = normalizarDni(dni);
    const inicio = dniLimpio.length - 6;
    const dniFormateado = `${dniLimpio.slice(0, inicio)}.${dniLimpio.slice(inicio, -3)}.${dniLimpio.slice(-3)}`;
    return [...new Set([dni.trim(), dniLimpio, dniFormateado])];
}

module.exports = {
    normalizarDni,
    validarFormatoDni,
    obtenerVariantesDni
};
