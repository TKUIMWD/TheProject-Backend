require('dotenv').config();
import {mailConfigurations,transporter} from "../../config/gmail";
import { logger } from "../../middlewares/log";
const BASE_URL = process.env.BASE_URL;

export function sendTemplateAuditResultEmail(toMail: string, templateName: string, status: string, rejectReason?: string) {
    const subject = `範本審核結果通知 - ${templateName}`;
    let text = `親愛的用戶，\n\n您的範本 "${templateName}" 的審核結果已經出爐。\n\n審核狀態: ${status}\n\n`;
    
    if (status === 'rejected' && rejectReason) {
        text += `拒絕原因: ${rejectReason}\n\n`;
    } else {
        text += "感謝您的提交！\n\n";
    }

    text += `如有任何疑問，請聯繫我們的客服團隊。\n\n謝謝！`;

    transporter.sendMail({
        ...mailConfigurations(toMail, subject, text)
    }).then((info: any) => {
        console.log(info);
        logger.info(`Template audit result email sent to ${toMail}`);
    }).catch((err: any) => {
        console.log(err);
        logger.error(`Failed to send template audit result email to ${toMail}`);
    });
}