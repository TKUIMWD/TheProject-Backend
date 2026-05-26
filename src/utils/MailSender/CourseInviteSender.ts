import { mailConfigurations, transporter } from "../../config/gmail";
import { logger } from "../../middlewares/log";
import { env } from "../../config/env";

export function sendCourseInvitationsEmail(toMail: string, courseName: string, course_id: string, inviterName: string) {
    const subject = `課程邀請 - ${courseName}`;
    const text = `親愛的用戶，\n\n您已被 ${inviterName} 邀請加入課程 "${courseName}"。\n\n請點擊以下連結以接受邀請並加入課程：\n${env.frontend.baseUrl}/courses/invited/${course_id}\n\n如有任何疑問，請聯繫我們的客服團隊。\n\n謝謝！`;

    transporter.sendMail({
        ...mailConfigurations(toMail, subject, text)
    }).then((info: any) => {
        logger.info(`課程邀請郵件已發送至 ${toMail}: ${info.messageId}`);
    }).catch((error: any) => {
        logger.error(`發送課程邀請郵件時出錯: ${error}`);
    });
}
