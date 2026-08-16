const nodemailer = require("nodemailer");

function obtenerConfiguracion() {
    return {
        host: process.env.MAIL_HOST,
        port: Number(process.env.MAIL_PORT || 587),
        secure: process.env.MAIL_SECURE === "true",
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
        from: process.env.MAIL_FROM || process.env.MAIL_USER,
        frontendUrl: process.env.FRONTEND_URL
    };
}

function obtenerDestinatario(venta) {
    return venta.clienteEmail || venta.usuario?.email || null;
}

function crearContenido(venta) {
    const fecha = new Date(venta.fecha).toLocaleString("es-AR");
    const detalles = venta.detalles.map((detalle) => {
        const precio = Number(detalle.precioUnitario).toFixed(2);
        return `- ${detalle.producto.nombre}: ${detalle.cantidad} x $${precio}`;
    }).join("\n");

    return [
        "Comprobante de venta",
        "",
        `Código: ${venta.codigoComprobante}`,
        `Fecha: ${fecha}`,
        "",
        "Productos:",
        detalles,
        "",
        `Total: $${Number(venta.total).toFixed(2)}`
    ].join("\n");
}

function escaparHtml(valor) {
    return String(valor)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function crearContenidoHtml(venta, frontendUrl) {
    const fecha = new Date(venta.fecha).toLocaleString("es-AR");
    const filas = venta.detalles.map((detalle) => {
        const precio = Number(detalle.precioUnitario).toFixed(2);
        const subtotal = Number(detalle.subtotal).toFixed(2);
        return `
            <tr>
                <td style="padding: 12px 0; border-bottom: 1px solid #e5e1d8; color: #1f2933;">${escaparHtml(detalle.producto.nombre)}</td>
                <td style="padding: 12px 8px; border-bottom: 1px solid #e5e1d8; color: #1f2933; text-align: center;">${detalle.cantidad}</td>
                <td style="padding: 12px 0; border-bottom: 1px solid #e5e1d8; color: #1f2933; text-align: right;">$${precio}</td>
                <td style="padding: 12px 0 12px 8px; border-bottom: 1px solid #e5e1d8; color: #1f2933; text-align: right;">$${subtotal}</td>
            </tr>`;
    }).join("");
    const urlComprobante = frontendUrl
        ? `${frontendUrl.replace(/\/$/, "")}/comprobante/${encodeURIComponent(venta.codigoComprobante)}`
        : null;
    const enlaceComprobante = urlComprobante
        ? `<a href="${escaparHtml(urlComprobante)}" style="display: inline-block; margin-top: 24px; padding: 13px 20px; background: #24543d; color: #ffffff; font-weight: 700; text-decoration: none;">Ver comprobante</a>`
        : "";

    return `<!doctype html>
<html lang="es">
<body style="margin: 0; padding: 24px 12px; background: #f4f1e8; color: #1f2933; font-family: Arial, sans-serif;">
    <main style="max-width: 620px; margin: 0 auto; background: #ffffff; border: 1px solid #ddd7ca;">
        <header style="padding: 28px 32px; background: #24543d; color: #ffffff; text-align: center;">
            <p style="margin: 0; font-size: 12px; letter-spacing: 2px; text-transform: uppercase;">Sistema POS</p>
            <h1 style="margin: 10px 0 0; font-size: 26px;">Tu compra fue cobrada</h1>
        </header>
        <section style="padding: 28px 32px;">
            <p style="margin: 0 0 20px; color: #52606d; line-height: 1.5;">Gracias por tu compra. Este es el resumen de tu comprobante.</p>
            <table role="presentation" width="100%" style="border-collapse: collapse; margin-bottom: 24px; font-size: 14px;">
                <tr>
                    <td style="color: #6b7280; padding-bottom: 6px;">Código</td>
                    <td style="text-align: right; font-family: monospace;">${escaparHtml(venta.codigoComprobante)}</td>
                </tr>
                <tr>
                    <td style="color: #6b7280;">Fecha</td>
                    <td style="text-align: right;">${escaparHtml(fecha)}</td>
                </tr>
            </table>
            <table role="presentation" width="100%" style="border-collapse: collapse; font-size: 14px;">
                <thead>
                    <tr style="color: #6b7280; font-size: 12px; text-transform: uppercase;">
                        <th style="padding: 10px 0; text-align: left; border-bottom: 2px solid #24543d;">Producto</th>
                        <th style="padding: 10px 8px; text-align: center; border-bottom: 2px solid #24543d;">Cant.</th>
                        <th style="padding: 10px 0; text-align: right; border-bottom: 2px solid #24543d;">Unitario</th>
                        <th style="padding: 10px 0 10px 8px; text-align: right; border-bottom: 2px solid #24543d;">Subtotal</th>
                    </tr>
                </thead>
                <tbody>${filas}</tbody>
            </table>
            <div style="margin-top: 24px; padding-top: 18px; border-top: 1px dashed #b8b1a3; text-align: right;">
                <span style="color: #6b7280; font-size: 14px; text-transform: uppercase;">Total</span>
                <strong style="display: block; margin-top: 4px; color: #24543d; font-size: 28px;">$${Number(venta.total).toFixed(2)}</strong>
            </div>
            ${enlaceComprobante}
        </section>
        <footer style="padding: 18px 32px; background: #f8f6f0; color: #6b7280; font-size: 12px; text-align: center;">
            Conservá este correo como comprobante de tu compra.
        </footer>
    </main>
</body>
</html>`;
}

async function enviarComprobanteVenta(venta) {
    const destinatario = obtenerDestinatario(venta);
    if (!destinatario) {
        return { enviado: false, estado: "OMITIDO", motivo: "La venta no tiene un email de destinatario" };
    }

    const configuracion = obtenerConfiguracion();
    if (!configuracion.host || !configuracion.user || !configuracion.pass) {
        return { enviado: false, estado: "OMITIDO", motivo: "El servicio de correo no está configurado" };
    }

    const transportador = nodemailer.createTransport({
        host: configuracion.host,
        port: configuracion.port,
        secure: configuracion.secure,
        auth: { user: configuracion.user, pass: configuracion.pass }
    });

    const resultado = await transportador.sendMail({
        from: configuracion.from,
        to: destinatario,
        subject: `Comprobante de venta ${venta.codigoComprobante}`,
        text: crearContenido(venta),
        html: crearContenidoHtml(venta, configuracion.frontendUrl)
    });

    return {
        enviado: true,
        estado: "ENVIADO",
        destinatario,
        mensajeId: resultado.messageId
    };
}

module.exports = { enviarComprobanteVenta };
