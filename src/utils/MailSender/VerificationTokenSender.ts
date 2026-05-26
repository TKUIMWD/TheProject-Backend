import { mailConfigurations, transporter } from "../../config/gmail";
import { logger } from "../../middlewares/log";
import { env } from "../../config/env";


export function sendVerificationEmail(toMail: string, token: string) {
    const subject = '信箱驗證';
    const frontendUrl = `${env.frontend.baseUrl}/verify?token=${token}`;
    const text = `請點擊下面的連結驗證您的電子郵件以開始使用我們的服務：
${frontendUrl}\n如果您沒有註冊或是更新個人資料，請忽略此郵件。`

    transporter.sendMail({
        ...mailConfigurations(toMail, subject, text)
    }).then((info: any) => {
        logger.info(`Verification email sent to ${toMail}: ${info.messageId}`);
    }).catch((err: any) => {
        logger.error(`Failed to send verification email to ${toMail}:`, err);
    });
}
