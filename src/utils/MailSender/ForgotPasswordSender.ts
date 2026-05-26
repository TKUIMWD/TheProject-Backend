import {mailConfigurations,transporter} from "../../config/gmail";
import { logger } from "../../middlewares/log";
import { env } from "../../config/env";

export function sendForgotPasswordEmail(toMail: string, token: string) {
    const subject = '重置密碼';
    const frontendUrl = `${env.frontend.baseUrl}/forgotPassword?token=${token}`;
    const text = `請點擊下面的連結重置密碼以繼續使用我們的服務：
${frontendUrl}\n如果您沒有申請重置密碼，請忽略此郵件。`
           
    transporter.sendMail({
        ...mailConfigurations(toMail, subject, text)
    }).then((info: any) => {
        logger.info(`Password reset email sent to ${toMail}: ${info.messageId}`);
    }).catch((err: any) => {
        logger.error(`Failed to send password reset email to ${toMail}:`, err);
    });
}
