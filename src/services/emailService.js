const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

const enviarCorreoRecuperacion = async (email, nombre, enlace) => {
  try {
    await resend.emails.send({
      from: 'onboarding@resend.dev', // Dominio de prueba de Resend
      to: email,
      subject: 'Restablecer Contraseña - Vendita',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; padding: 20px; border-radius: 10px;">
          <h2 style="color: #10b981;">Hola, ${nombre}</h2>
          <p>Has solicitado restablecer tu contraseña en <strong>Vendita</strong>.</p>
          <p>Haz clic en el siguiente botón para continuar:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${enlace}" style="background-color: #10b981; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">
              Restablecer Contraseña
            </a>
          </div>
          <p style="font-size: 12px; color: #999;">Este enlace expirará en 1 hora. Si no solicitaste este cambio, ignora este correo.</p>
        </div>
      `
    });
  } catch (error) {
    console.error("Error enviando email con Resend:", error);
    throw new Error("No se pudo enviar el email.");
  }
};

module.exports = { enviarCorreoRecuperacion };