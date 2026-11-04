const nodemailer = require('nodemailer');
const { config } = require('../config');

let transporter = null;
if (config.mail.configured) {
  transporter = nodemailer.createTransport({
    host: config.mail.host,
    port: config.mail.port,
    secure: config.mail.secure,
    auth: config.mail.user ? { user: config.mail.user, pass: config.mail.pass } : undefined
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

function otpBlock(code, minutes) {
  return `<p style="font-size:14px;line-height:1.6">Use this verification code. It expires in ${minutes} minutes and can only be used once.</p>
  <div style="font-size:32px;letter-spacing:10px;font-weight:800;background:#f3efff;border-radius:12px;padding:16px;text-align:center;color:#4b329a">${code}</div>
  <p style="font-size:12px;color:#77748e">Never share this code with anyone. Sahayog staff will never ask for it.</p>`;
}

async function send({ to, subject, text, html }) {
  if (transporter) {
    await transporter.sendMail({ from: config.mail.from, to, subject, text, html });
    return;
  }
  if (config.mail.devConsole) {
    // Development convenience only (disabled in production by config).
    console.log(`\n──── [DEV MAIL] to: ${to}\nSubject: ${subject}\n${text}\n────\n`);
    return;
  }
  throw Object.assign(new Error('Email delivery is not configured.'), { status: 503, expose: true });
}

const mailer = {
  sendSignupOtp(to, name, code) {
    const m = config.otp.ttlMinutes;
    return send({
      to,
      subject: 'Your Sahayog verification code',
      text: `Hi ${name},\n\nYour Sahayog verification code is ${code}. It expires in ${m} minutes.\n\nIf you didn't sign up, ignore this email.`,
      html: layout(`Welcome, ${escapeHtml(name)}!`, otpBlock(code, m))
    });
  },
  sendResetOtp(to, code) {
    const m = config.otp.ttlMinutes;
    return send({
      to,
      subject: 'Reset your Sahayog password',
      text: `Your Sahayog password reset code is ${code}. It expires in ${m} minutes.\n\nIf you didn't request a reset, ignore this email — your password will not change.`,
      html: layout('Reset your password', otpBlock(code, m))
    });
  },
  sendAlreadyRegistered(to) {
    return send({
      to,
      subject: 'You already have a Sahayog account',
      text: 'Someone (hopefully you) tried to sign up with this email, but an account already exists. You can log in, or use "Forgot password" to reset your password.',
      html: layout('You already have an account', '<p style="font-size:14px;line-height:1.6">Someone (hopefully you) tried to sign up with this email address, but an account already exists. Log in instead, or use <b>Forgot password</b> on the login page to reset your password.</p>')
    });
  },
  sendPasswordChanged(to) {
    return send({
      to,
      subject: 'Your Sahayog password was changed',
      text: 'Your Sahayog password was just changed and all devices were signed out. If this wasn\'t you, reset your password immediately.',
      html: layout('Password changed', '<p style="font-size:14px;line-height:1.6">Your password was just changed and all other sessions were signed out. If this wasn\'t you, use <b>Forgot password</b> right away.</p>')
    });
  }
};

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

module.exports = mailer;
