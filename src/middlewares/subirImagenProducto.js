const multer = require("multer");
const ErrorPersonalizado = require("../utils/errorPersonalizado");

const tiposImagen = {
    "image/jpeg": { extension: ".jpg", validar: (buffer) => buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff },
    "image/png": { extension: ".png", validar: (buffer) => buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
    "image/webp": { extension: ".webp", validar: (buffer) => buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP" }
};

const recibirImagen = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, callback) => {
        if (!tiposImagen[file.mimetype]) {
            return callback(new ErrorPersonalizado("La imagen debe ser JPG, PNG o WebP", 400));
        }
        callback(null, true);
    }
}).single("imagen");

function subirImagenProducto(req, res, next) {
    recibirImagen(req, res, (error) => {
        if (error) {
            if (error.code === "LIMIT_FILE_SIZE") {
                return next(new ErrorPersonalizado("La imagen no puede superar los 5 MB", 413));
            }
            return next(error);
        }

        if (req.file) {
            const tipo = tiposImagen[req.file.mimetype];
            if (!tipo || !tipo.validar(req.file.buffer)) {
                return next(new ErrorPersonalizado("El archivo no contiene una imagen JPG, PNG o WebP válida", 400));
            }
            req.imagenProducto = {
                buffer: req.file.buffer,
                extension: tipo.extension
            };
        }

        next();
    });
}

module.exports = subirImagenProducto;
