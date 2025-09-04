require('dotenv').config();
import {mailConfigurations,transporter} from "../../config/gmail";
import { logger } from "../../middlewares/log";

export function sendForgotPasswordEmail(toMail: string, token: string) {
    const subject = '重置密碼';
    const frontendUrl = process.env.FRONTEND_BASE_URL+`/forgotPassword?token=${token}`;
    const text = `請點擊下面的連結重置密碼以繼續使用我們的服務：
${frontendUrl}\n如果您沒有申請重置密碼，請忽略此郵件。`
           
    transporter.sendMail({
        ...mailConfigurations(toMail, subject, text)
    }).then((info: any) => {
        console.log(info);
        logger.info(`Password reset email sent to ${toMail}`);
    }).catch((err: any) => {
        console.log(err);
        logger.error(`Failed to send password reset email to ${toMail}`);
    });
}