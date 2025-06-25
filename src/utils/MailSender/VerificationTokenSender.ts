require('dotenv').config();
import { mailConfigurations, transporter } from "../../config/gmail";
import { logger } from "../../middlewares/log";
const BASE_URL = process.env.BASE_URL;


export function sendVerificationEmail(toMail: string, token: string) {
    const subject = '信箱驗證';
    const frontendUrl = process.env.FRONTEND_BASE_URL + `/verify?token=${token}`;
    const text = `請點擊下面的連結驗證您的電子郵件以開始使用我們的服務：
${frontendUrl}\n如果您沒有註冊或是更新個人資料，請忽略此郵件。`

    transporter.sendMail({
        ...mailConfigurations(toMail, subject, text)
    }).then((info: any) => {
        console.log(info);
        logger.info(`Verification email sent to ${toMail}`);
    }).catch((err: any) => {
        console.log(err);
        logger.error(`Failed to send verification email to ${toMail}`);
    });
}