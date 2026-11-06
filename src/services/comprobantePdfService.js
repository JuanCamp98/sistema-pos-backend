const PDFDocument = require("pdfkit");

const MARGEN = 48;
const FORMATO_MONEDA = new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS"
});

function textoDisponible(valor, alternativa = "No disponible") {
    return valor === null || valor === undefined || valor === "" ? alternativa : String(valor);
}

function formatearImporte(valor) {
    if (valor === null || valor === undefined || valor === "") return "No disponible";
    const importe = Number(valor);
    return Number.isFinite(importe) ? FORMATO_MONEDA.format(importe) : "No disponible";
}

function formatearFecha(fecha) {
    if (fecha === null || fecha === undefined || fecha === "") return "No disponible";
    const fechaOperacion = new Date(fecha);
    if (Number.isNaN(fechaOperacion.getTime())) return "No disponible";

    return fechaOperacion.toLocaleString("es-AR", {
        dateStyle: "medium",
        timeStyle: "short"
    });
}

function agregarEncabezadoTabla(documento) {
    const columnas = documento.page.width - MARGEN * 2;
    const producto = columnas * 0.46;
    const cantidad = columnas * 0.1;
    const unitario = columnas * 0.2;
    const subtotal = columnas - producto - cantidad - unitario;
    const y = documento.y;

    documento.font("Helvetica-Bold").fontSize(9).fillColor("#52606d");
    documento.text("Producto", MARGEN, y, { width: producto });
    documento.text("Cant.", MARGEN + producto, y, { width: cantidad, align: "right" });
    documento.text("Precio unit.", MARGEN + producto + cantidad, y, { width: unitario, align: "right" });
    documento.text("Subtotal", MARGEN + producto + cantidad + unitario, y, { width: subtotal, align: "right" });
    documento.moveDown(0.8);
    documento.moveTo(MARGEN, documento.y).lineTo(documento.page.width - MARGEN, documento.y).strokeColor("#ddd7ca").stroke();
    documento.moveDown(0.5);

    return { producto, cantidad, unitario, subtotal };
}

function generarComprobantePdf(venta) {
    return new Promise(function (resolve, reject) {
        const documento = new PDFDocument({
            size: "A4",
            margins: { top: MARGEN, right: MARGEN, bottom: MARGEN, left: MARGEN },
            compress: false,
            info: { Title: "Comprobante de compra", Author: "Sistema POS" }
        });
        const partes = [];

        documento.on("data", function (parte) { partes.push(parte); });
        documento.on("end", function () { resolve(Buffer.concat(partes)); });
        documento.on("error", reject);

        try {
            documento.font("Helvetica-Bold").fontSize(20).fillColor("#24543d").text("Sistema POS");
            documento.font("Helvetica").fontSize(10).fillColor("#52606d").text("Comprobante de compra");
            documento.moveDown(0.8);
            documento.moveTo(MARGEN, documento.y).lineTo(documento.page.width - MARGEN, documento.y).strokeColor("#ddd7ca").stroke();
            documento.moveDown(1.2);

            const cliente = [venta.clienteNombre, venta.clienteApellido].filter(Boolean).join(" ");
            const datosCompra = [
                ["Código", textoDisponible(venta.codigoComprobante)],
                ["Fecha y hora", formatearFecha(venta.fecha || venta.creadoEn)],
                ["Cliente", cliente || "Consumidor final"],
                ["Estado", textoDisponible(venta.estado)]
            ];

            datosCompra.forEach(function (dato) {
                documento.font("Helvetica-Bold").fontSize(9).fillColor("#52606d").text(dato[0], MARGEN, documento.y, { continued: true });
                documento.font("Helvetica").fillColor("#1f2933").text("  " + dato[1]);
            });

            documento.moveDown(1.2);
            documento.font("Helvetica-Bold").fontSize(12).fillColor("#1f2933").text("Productos");
            documento.moveDown(0.7);

            const columnas = agregarEncabezadoTabla(documento);
            const detalles = Array.isArray(venta.detalles) ? venta.detalles : [];

            if (detalles.length === 0) {
                documento.font("Helvetica").fontSize(10).fillColor("#52606d").text("No hay productos registrados para esta compra.");
            } else {
                detalles.forEach(function (detalle) {
                    const nombre = textoDisponible(detalle?.producto?.nombre, "Producto no disponible");
                    const cantidad = textoDisponible(detalle?.cantidad);
                    const precioUnitario = formatearImporte(detalle?.precioUnitario);
                    const subtotal = formatearImporte(detalle?.subtotal);
                    const altoTexto = documento.heightOfString(nombre, { width: columnas.producto });
                    const altoFila = Math.max(24, altoTexto + 10);
                    const limiteFila = documento.page.height - documento.page.margins.bottom - 110;

                    if (documento.y + altoFila > limiteFila) {
                        documento.addPage();
                        documento.font("Helvetica-Bold").fontSize(12).fillColor("#1f2933").text("Productos (continuación)");
                        documento.moveDown(0.7);
                        agregarEncabezadoTabla(documento);
                    }

                    const y = documento.y;
                    documento.font("Helvetica").fontSize(9).fillColor("#1f2933");
                    documento.text(nombre, MARGEN, y + 4, { width: columnas.producto });
                    documento.text(cantidad, MARGEN + columnas.producto, y + 4, { width: columnas.cantidad, align: "right" });
                    documento.text(precioUnitario, MARGEN + columnas.producto + columnas.cantidad, y + 4, { width: columnas.unitario, align: "right" });
                    documento.text(subtotal, MARGEN + columnas.producto + columnas.cantidad + columnas.unitario, y + 4, { width: columnas.subtotal, align: "right" });
                    documento.y = y + altoFila;
                    documento.moveTo(MARGEN, documento.y).lineTo(documento.page.width - MARGEN, documento.y).strokeColor("#eee9df").stroke();
                    documento.moveDown(0.3);
                });
            }

            if (documento.y + 75 > documento.page.height - documento.page.margins.bottom) {
                documento.addPage();
            }

            documento.moveDown(0.8);
            documento.x = MARGEN;
            documento.font("Helvetica").fontSize(9).fillColor("#52606d")
                .text("Descuentos: no registrados por separado en esta venta.", MARGEN, documento.y, {
                    width: documento.page.width - MARGEN * 2,
                    align: "left"
                });
            documento.moveDown(0.8);
            documento.moveTo(MARGEN, documento.y).lineTo(documento.page.width - MARGEN, documento.y).strokeColor("#24543d").lineWidth(1.5).stroke();
            documento.moveDown(0.8);
            documento.font("Helvetica-Bold").fontSize(15).fillColor("#24543d")
                .text("Total de la compra", MARGEN, documento.y, { continued: true });
            documento.text("  " + formatearImporte(venta.total), { align: "right" });
            documento.end();
        } catch (error) {
            documento.destroy();
            reject(error);
        }
    });
}

module.exports = { generarComprobantePdf };
