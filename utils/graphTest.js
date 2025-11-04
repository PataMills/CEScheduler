import 'dotenv/config';
import fs from 'fs';
import { sendMailViaGraph } from './utils/graphMailer.js';

const pdf = Buffer.from('%PDF-1.4\n%…dummy…\n', 'utf8'); // or use a real buffer you have

await sendMailViaGraph({
  to: process.env.SMTP_USER,
  subject: 'Graph sendMail test ✅',
  text: 'If you got this, Graph mail works.',
  attachments: [{ filename: 'test.pdf', content: pdf }]
});

console.log('Sent via Graph');
