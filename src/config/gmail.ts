require('dotenv').config();

const senderEmail = process.env.SENDER_EMAIL;

if (!senderEmail) {
    throw new Error('SENDER_EMAIL is not defined in the environment variables');
}

const mailConfigurations = (toMail:string, token: string,subject:string,text:string) => ({
    from: `${senderEmail}`,

    to: `${toMail}`,

    subject: `${subject}`,
    
    text: `${text}`
});

export default mailConfigurations;