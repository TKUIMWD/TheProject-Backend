require('dotenv').config();
import {mailConfigurations,transporter} from "../../config/gmail";
import { logger } from "../../middlewares/log";

export function sendBoxAuditResultEmail(toMail: string, boxDescription: string, status: string, rejectReason?: string) {
    const subject = `Box 審核結果通知 - ${boxDescription}`;
    let text = `親愛的用戶，\n\n您的 Box "${boxDescription}" 的審核結果已經出爐。\n\n審核狀態: ${status}\n\n`;
    
    if (status === 'rejected' && rejectReason) {
        text += `拒絕原因: ${rejectReason}\n\n`;
    } else if (status === 'approved') {
        text += `恭喜！您的 Box 已經通過審核，現在可以在平台上公開使用。\n\n`;
        text += `您可以在公開 Box 列表中查看您的 Box。\n\n`;
    }

    text += `如有任何疑問，請聯繫我們的客服團隊。\n\n謝謝！`;

    transporter.sendMail({
        ...mailConfigurations(toMail, subject, text)
    }).then((info: any) => {
        console.log(info);
        logger.info(`Box audit result email sent to ${toMail}`);
    }).catch((err: any) => {
        console.log(err);
        logger.error(`Failed to send box audit result email to ${toMail}`);
    });
}
