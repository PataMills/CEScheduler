// testmail.js
import 'dotenv/config';
import nodemailer from 'nodemailer';
import { ClientSecretCredential } from '@azure/identity';

async function main() {
  try {
    // 1. Load credentials from .env
    const tenantId = process.env.AZURE_TENANT_ID;
    const clientId = process.env.AZURE_CLIENT_ID;
    const clientSecret = process.env.AZURE_CLIENT_SECRET;
    const smtpUser = process.env.SMTP_USER;

    // 2. Request an OAuth token from Microsoft
    const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
    const token = await credential.getToken('https://outlook.office365.com/.default');
    if (!token) throw new Error('Failed to get access token');

    console.log('✅ Got access token, expires on:', token.expiresOnTimestamp);

    // 3. Create a Nodemailer transport using OAuth2
    const transporter = nodemailer.createTransport({
      host: 'smtp.office365.com',
      port: 587,
      secure: false,
      auth: {
        type: 'OAuth2',
        user: smtpUser,
        accessToken: token.token,
      },
      tls: { ciphers: 'TLSv1.2' },
    });

    // 4. Verify connection and send test email
    await transporter.verify();
    console.log('✅ SMTP connection verified');

    const info = await transporter.sendMail({
      from: smtpUser,
      to: smtpUser, // send to yourself for testing
      subject: '✅ OAuth SMTP Test from Node',
      text: 'If you received this, OAuth2 with Office 365 is working!',
    });

    console.log('📨 Message sent:', info.messageId);
  } catch (err) {
    console.error('❌ Error:', err);
  }
}

main();
