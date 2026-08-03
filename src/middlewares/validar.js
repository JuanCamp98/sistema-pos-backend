function validar(schema) {
    return function (req, res, next) {
        const resultado = schema.safeParse(req.body);
        if (!resultado.success) {
            const errores = resultado.error.issues.map(function (issue) {
                return issue.path.join(".") + ": " + issue.message;
            });
            return res.status(400).json({ mensaje: "Datos invalidos", errores: errores });
        }
        req.body = resultado.data;
        next();
    };
}

module.exports = validar;