import 'server-only';
import nodemailer from 'nodemailer';
import { database } from './db';
import { createAuth } from './auth-core';

export function auth() {
  return createAuth(database(), process.env.SAAS_AUTH_SECRET ?? '', async (email, code) => {
    const login = process.env.BREVO_SMTP_LOGIN, key = process.env.BREVO_SMTP_KEY;
    const sender = process.env.BREVO_SENDER_EMAIL;
    if (!login || !key || !sender) throw new Error('Brevo SMTP configuration is incomplete');
    const transport = nodemailer.createTransport({ host: 'smtp-relay.brevo.com', port: 587,
      secure: false, requireTLS: true, auth: { user: login, pass: key },
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
      logger: false, debug: false });
    try {
      await transport.sendMail({ from: { name: process.env.BREVO_SENDER_NAME || 'Brisky', address: sender },
        to: email, subject: 'Your Brisky sign-in code',
        text: `Your Brisky sign-in code is ${code}.\n\nIt expires in 10 minutes and can be used once. If you did not request this code, ignore this email.` });
    } finally { transport.close(); }
  });
}
