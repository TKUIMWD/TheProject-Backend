import mailConfigurations from "../config/gmail";
import { logger } from "../middlewares/log";

const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.SENDER_EMAIL,
        pass: process.env.GOOGLE_APP_PASSWORD
    }
});

export function sendVerificationEmail(toMail: string, token: string) {
    transporter.sendMail({
        ...mailConfigurations(toMail, token)
    }).then((info: any) => {
        console.log(info);
        logger.info(`Verification email sent to ${toMail}`);
    }).catch((err: any) => {
        console.log(err);
        logger.error(`Failed to send verification email to ${toMail}`);
    });
}