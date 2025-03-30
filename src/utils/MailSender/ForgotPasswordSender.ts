require('dotenv').config();
import {mailConfigurations,transporter} from "../../config/gmail";
import { logger } from "../../middlewares/log";
const BASE_URL = process.env.BASE_URL;

export function sendForgotPasswordEmail(toMail: string, token: string) {
    const subject = '重置密碼';
    const text = `請點擊下面的連結重置密碼以繼續使用我們的服務：
${BASE_URL}/api/v1/auth/forgotPassword/?token=${token}\n如果您沒有申請重置密碼，請忽略此郵件。`
           
    transporter.sendMail({
        ...mailConfigurations(toMail, token, subject, text)
    }).then((info: any) => {
        console.log(info);
        logger.info(`Password reset email sent to ${toMail}`);
    }).catch((err: any) => {
        console.log(err);
        logger.error(`Failed to send password reset email to ${toMail}`);
    });
}

/*
之後連結改成前端頁面，而不是直接連到後端，在前端填寫新密碼後透過API回傳給後端
*/