const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

// Remitente configurable por entorno (formato "Nombre <correo@dominio>").
// Por defecto usa mail.tyndallcore.com, ya verificado en Resend (DKIM, SPF,
// DMARC) — antes estaba fijo en 'onboarding@resend.dev', el dominio de
// pruebas de Resend, que solo entrega al correo de la propia cuenta y nunca
// le llega a un usuario real.
const EMAIL_FROM = process.env.EMAIL_FROM || 'Vendita <no-reply@mail.tyndallcore.com>';

const enviarCorreoRecuperacion = async (email, nombre, enlace) => {
  try {
    await resend.emails.send({
      from: EMAIL_FROM,
      to: email,
      subject: 'Restablece tu contraseña de Vendita',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
          <h2 style="color: #10b981;">Hola, ${nombre}</h2>
          <p>Alguien solicitó restablecer la contraseña de tu cuenta en <strong>Vendita</strong>. Si fuiste tú, haz clic en el siguiente botón para crear una nueva:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${enlace}" style="background-color: #10b981; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">
              Restablecer contraseña
            </a>
          </div>
          <p style="font-size: 13px; color: #666;">Este enlace expira en 1 hora.</p>
          <p style="font-size: 12px; color: #999;">Si no fuiste tú quien lo solicitó, ignora este mensaje — tu contraseña actual sigue siendo válida y no se hizo ningún cambio.</p>
        </div>
      `
    });
  } catch (error) {
    console.error("Error enviando email con Resend:", error);
    throw new Error("No se pudo enviar el email.");
  }
};

module.exports = { enviarCorreoRecuperacion, EMAIL_FROM };