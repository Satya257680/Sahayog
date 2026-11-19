const nodemailer = require("nodemailer");
const { config } = require("../config");

let transporter = null;
if (config.mail.configured) {
  transporter = nodemailer.createTransport({
    host: config.mail.host,
    port: config.mail.port,
    secure: config.mail.secure,
    auth: config.mail.user
      ? { user: config.mail.user, pass: config.mail.pass }
      : undefined,
  });
}

function layout(title, bodyHtml) {
  return `<!doctype html><html><body style="margin:0;background:#faf7ff;font-family:Arial,Helvetica,sans-serif;color:#29214f">
  <div style="max-width:520px;margin:24px auto;background:#fff;border:1px solid #e9e5f0;border-radius:16px;padding:28px">
    <div style="font-size:22px;font-weight:800;color:#4b329a">Sahayog</div>
    <div style="font-size:12px;color:#77748e;margin-bottom:20px">Give · Receive · Be Kind</div>
    <h2 style="margin:0 0 12px;font-size:18px">${title}</h2>
    ${bodyHtml}
    <p style="font-size:12px;color:#77748e;margin-top:28px">If you didn't request this, you can safely ignore this email.</p>
  </div></body></html>`;
}

function buttonBlock(href, label) {
  return `<p style="margin:22px 0"><a href="${escapeHtml(href)}" style="display:inline-block;background:#4b329a;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px">${escapeHtml(label)}</a></p>
  <p style="font-size:12px;color:#77748e;line-height:1.6">Button not working? Copy and paste this link into your browser:<br><span style="word-break:break-all">${escapeHtml(href)}</span></p>`;
}

async function send({ to, subject, text, html }) {
  if (transporter) {
    await transporter.sendMail({
      from: config.mail.from,
      to,
      subject,
      text,
      html,
    });
    return;
  }
  if (config.mail.devConsole) {
    // Development-only stand-in for an inbox (config forces this off when NODE_ENV=production).
    // It prints the email body, which for reset emails includes the one-time link, so never enable it on a shared server.
    console.log(
      `\n──── [DEV MAIL] to: ${to}\nSubject: ${subject}\n${text}\n────\n`,
    );
    return;
  }
  throw Object.assign(new Error("Email delivery is not configured."), {
    status: 503,
    expose: true,
  });
}

const mailer = {
  /** True when an email can actually be delivered (SMTP, or the development console transport). */
  isConfigured() {
    return Boolean(transporter) || config.mail.devConsole;
  },

  /** Email-link password reset. `link` contains the raw token, so it is never logged by the API. */
  sendPasswordResetLink(to, link, minutes) {
    return send({
      to,
      subject: "Reset your Sahayog password",
      text: `We received a request to reset your Sahayog password.\n\nOpen this link to choose a new password (it expires in ${minutes} minutes and can only be used once):\n${link}\n\nIf you didn't request a reset, ignore this email — your password will not change.`,
      html: layout(
        "Reset your password",
        `<p style="font-size:14px;line-height:1.6">We received a request to reset your Sahayog password. This link expires in ${minutes} minutes and can only be used once.</p>${buttonBlock(link, "Choose a new password")}`,
      ),
    });
  },
  sendPasswordChanged(to) {
    return send({
      to,
      subject: "Your Sahayog password was changed",
      text: "Your Sahayog password was just changed and all devices were signed out. If this wasn't you, reset your password immediately.",
      html: layout(
        "Password changed",
        '<p style="font-size:14px;line-height:1.6">Your password was just changed and all other sessions were signed out. If this wasn\'t you, use <b>Forgot password</b> right away.</p>',
      ),
    });
  },
};

function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}

module.exports = mailer;
