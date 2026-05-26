import { env } from './env';

const senderEmail = env.mail.senderEmail;
const nodemailer = require('nodemailer');

if (!senderEmail) {
    throw new Error('SENDER_EMAIL is not defined in the environment variables');
}

export const mailConfigurations = (toMail:string,subject:string,text:string) => ({
    from: `${senderEmail}`,

    to: `${toMail}`,

    subject: `${subject}`,
    
    text: `${text}`
});

export const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: env.mail.senderEmail,
        pass: env.mail.googleAppPassword
    }
});
