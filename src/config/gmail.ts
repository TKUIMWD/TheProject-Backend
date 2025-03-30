require('dotenv').config();

const senderEmail = process.env.SENDER_EMAIL;
const BASE_URL = process.env.BASE_URL;


if (!senderEmail) {
    throw new Error('SENDER_EMAIL is not defined in the environment variables');
}

const mailConfigurations = (toMail:string, token: string) => ({
    from: `${senderEmail}`,

    to: `${toMail}`,

    subject: '信箱驗證',
    
    text: `Hi! ， 你最近訪問我們的網站並使用這個 Email 註冊了一個帳號。請點擊下面的連結以驗證您的電子郵件
${BASE_URL}/api/v1/auth/verify/?token=${token} 
           如果您沒有註冊，請忽略此郵件。`
});

export default mailConfigurations;