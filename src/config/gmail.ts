require('dotenv').config();

const senderEmail = process.env.SENDER_EMAIL;

if (!senderEmail) {
    throw new Error('SENDER_EMAIL is not defined in the environment variables');
}

export const mailConfigurations = (toMail:string, token: string,subject:string,text:string) => ({
    from: `${senderEmail}`,

    to: `${toMail}`,

    subject: `${subject}`,
    
    text: `${text}`
});


const nodemailer = require('nodemailer');

export const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.SENDER_EMAIL,
        pass: process.env.GOOGLE_APP_PASSWORD
    }
});