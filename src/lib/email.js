// E-mail küldés SMTP-n keresztül (nodemailer). Beállítások a beállítás-tárból.
const nodemailer = require('nodemailer');
const settings = require('../services/settings');

let transporter = null;
let signature = null;

function isEnabled() {
  return Boolean(settings.get('SMTP_HOST'));
}

// A klienst lazán hozzuk létre, és újraépítjük, ha változtak a beállítások.
function getTransporter() {
  if (!isEnabled()) return null;
  const sig = [
    settings.get('SMTP_HOST'), settings.get('SMTP_PORT'), settings.getBool('SMTP_SECURE'),
    settings.get('SMTP_USER'), settings.get('SMTP_PASS'),
  ].join('|');
  if (transporter && sig === signature) return transporter;

  const user = settings.get('SMTP_USER');
  const pass = settings.get('SMTP_PASS');
  transporter = nodemailer.createTransport({
    host: settings.get('SMTP_HOST'),
    port: parseInt(settings.get('SMTP_PORT') || '587', 10),
    secure: settings.getBool('SMTP_SECURE'),
    auth: user ? { user, pass } : undefined,
  });
  signature = sig;
  return transporter;
}

function fromAddress() {
  return settings.get('EMAIL_FROM') || settings.get('SMTP_USER') || 'no-reply@sportfog.hu';
}

async function sendMail({ to, subject, text, html }) {
  const t = getTransporter();
  if (!t) return { success: false, error: 'Az e-mail (SMTP) nincs beállítva.' };
  try {
    const info = await t.sendMail({ from: fromAddress(), to, subject, text, html });
    return { success: true, messageId: info.messageId };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = { isEnabled, sendMail };
