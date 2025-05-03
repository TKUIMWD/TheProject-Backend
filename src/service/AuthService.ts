import bcrypt from "bcrypt";
import { Service } from "../abstract/Service";
import { resp } from "../utils/resp";
import { DBResp } from "../interfaces/DBResp";
import { Document } from "mongoose";
import { generatePasswordResetToken, generateToken,generateVerificationToken, verifyToken } from "../utils/token";
import { AuthResponse } from "../interfaces/AuthResponse";
import { logger } from "../middlewares/log";
import { Request, Response } from "express";
import { UsersModel } from "../orm/schemas/UserSchemas";
import { sendVerificationEmail } from "../utils/MailSender/VerificationTokenSender";
import { sendForgotPasswordEmail } from "../utils/MailSender/ForgotPasswordSender";
import { generateHashedPassword, passwordStrengthCheck } from "../utils/password";


export class AuthService extends Service {
    /*
    * @param data : {username:string,email:string,password:string}
    * @returns resp<DBResp<Document> | undefined>
    */
    public async register(data :{username:string,email:string,password:string}):Promise<resp<DBResp<Document> | undefined>> {
        const resp: resp<DBResp<Document> | undefined> = {
            code: 200,
            message: "",
            body: undefined
        };

        try {
            const { username, email, password } = data;
            if (!username || !email || !password) {
                resp.code = 400;
                const missingFields = [];
                if (!username) missingFields.push("username");
                if (!email) missingFields.push("email");
                if (!password) missingFields.push("password");
                resp.message = `missing required fields: ${missingFields.join(", ")}`;
                return resp;
            }

            // check if username or email already exists
            const existingUsername = await UsersModel.findOne({ username });
            const existingEmail = await UsersModel.findOne({ email });
            
            if (existingUsername || existingEmail) {
                if (existingEmail && existingEmail.isVerified === false) {
                    resp.code = 400;
                    resp.message = "email already exists but not verified , please verify your email";
                    logger.warn(`someone tried to register with existing email but not verified: ${email}`);
                    sendVerificationEmail(existingEmail.email,generateVerificationToken(existingEmail._id));
                    return resp;
                }
                resp.code = 400;
                resp.message = "cannot register";
                logger.warn(`someone tried to register with existing username or email: ${username}, ${email}`);
                return resp;
            }

            const passwordStrengthCheckResult = passwordStrengthCheck(password);
            if (!passwordStrengthCheckResult.isValid) {
                resp.code = 400;
                resp.message = `password does not meet the requirements: ${passwordStrengthCheckResult.missingRequirements.join(", ")}`;
                return resp;
            }
            const hashedPassword = await generateHashedPassword(password);

            const newRegisterUser = new UsersModel({
                username,
                password_hash:hashedPassword,
                email,
                isVerified:false
            });

            await newRegisterUser.save();
            resp.message = "user registered successfully";
            logger.info(`user registered successfully: ${username}`);
            sendVerificationEmail(newRegisterUser.email,generateVerificationToken(newRegisterUser._id));
        } catch (error) {
            logger.error(error);
            resp.code = 500;
            resp.message = "internal server error";
        }
        return resp;
    }


    public async verify(Request:Request):Promise<resp<AuthResponse | undefined>> {
        const resp: resp<AuthResponse | undefined> = {
            code: 200,
            message: "",
            body: undefined
        };

        try {
            const authHeader = Request.headers.authorization;
            if (!authHeader) {
                resp.code = 400;
                resp.message = "missing authorization header";
                return resp;
            }
            const token = authHeader.split(" ")[1];
            const decoded = verifyToken(token);
            if (!decoded) {
                resp.code = 400;
                resp.message = "invalid token";
                return resp;
            }
            const { _id } = decoded as { _id: string };
            const user = await UsersModel.findById(_id);
            if (user) {
                user.isVerified = true;
                await user.save();
                resp.message = "email verified successfully";
                logger.info(`email verified successfully for ${user.email}`);
            }
            else {
                resp.code = 400;
                resp.message = "invalid token";
                logger.warn(`someone tried to verify with invalid token: ${token}`);
            }
        } catch (error) {
            logger.error(error);
            resp.code = 500;
            resp.message = "internal server error";
        }
        return resp;
    }

    /*
    * @param data : {username:string,password:string}
    * @returns resp<AuthResponse | undefined>
    */
    public async login(data:{username:string,password:string}):Promise<resp<AuthResponse | undefined>> {
        const resp: resp<AuthResponse | undefined> = {
            code: 200,
            message: "",
            body: undefined
        };

       try {
            const { username, password } = data;
            if (!username || !password) {
                resp.code = 400;
                const missingFields = [];
                if (!username) missingFields.push("username");
                if (!password) missingFields.push("password");
                resp.message = `missing required fields: ${missingFields.join(", ")}`;
                return resp;
            }
            const user = await UsersModel.findOne({ username });
            if (!user) {
                resp.code = 400;
                resp.message = "invalid username or password";
                logger.warn(`someone tried to login with invalid username: ${username}`);
                return resp;
            }
            if (!user.isVerified) {
                resp.code = 400;
                resp.message = "email not verified, please verify your email";
                sendVerificationEmail(user.email,generateVerificationToken(user._id));
                logger.warn(`someone tried to login with unverified email: ${user.email}`);
                return resp;
            }
            const isMatch = await bcrypt.compare(password, user.password_hash);
            if (!isMatch) {
                resp.code = 400;
                resp.message = "invalid username or password";
                logger.warn(`someone tried to login with invalid password: ${username}`);
                return resp;
            }
            const token = generateToken(user._id, user.role , user.username);
            resp.message = "login successful";
            resp.body = { token } as AuthResponse;
            logger.info(`login successful for ${username}`);
       
        } catch (error) {
            logger.error(error);
            resp.code = 500;
            resp.message = "internal server error";
        }
        return resp;
    }

    public async logout(Request: Request):Promise<resp<DBResp<Document> | undefined>> {
        const resp: resp<DBResp<Document> | undefined> = {
            code: 200,
            message: "",
            body: undefined
        };

        try {
            const authHeader = Request.headers.authorization;
            if (!authHeader) {
                resp.code = 400;
                resp.message = "missing authorization header";
                return resp;
            }
            const token = authHeader.split(" ")[1];
            const decoded = verifyToken(token);
            if (!decoded) {
                resp.code = 400;
                resp.message = "invalid token";
                return resp;
            }
            const { _id } = decoded as { _id: string };
            const user = await UsersModel.findById(_id);
            if (!user) {
                resp.code = 400;
                resp.message = "invalid token";
                return resp;
            }
            resp.message = "logout successful";
            logger.info(`logout successful for ${user.username}`);
        } catch (error) {
            logger.error(error);
            resp.code = 500;
            resp.message = "internal server error";
        }
        return resp;
    }

    public async forgotPassword(Request: Request):Promise<resp<DBResp<Document> | undefined>> {
        const resp: resp<DBResp<Document> | undefined> = {
            code: 200,
            message: "",
            body: undefined
        };

        if (Request.method === "POST") {
            try {
                const email = Request.body.email;
                const user = await UsersModel.findOne({ email });
                if (!user) {
                    resp.code = 200;
                    resp.message = "If the email exists, a password reset email has been sent";
                    return resp;
                }
                if (!email) {
                    resp.code = 400;
                    resp.message = "missing email field";
                    return resp;
                }
                sendForgotPasswordEmail(email,generatePasswordResetToken(email));
                resp.message = "password reset email sent";
                // logger.info(`password reset email sent to ${email}`);
            } catch (error) {
                logger.error(error);
                resp.code = 500;
                resp.message = "internal server error";
            }
        }
        else if (Request.method === "PUT") {
            try {
                const authHeader = Request.headers.authorization;
                if (!authHeader) {
                    resp.code = 400;
                    resp.message = "missing authorization header";
                    return resp;
                }
                const token = authHeader.split(" ")[1];
                const decoded = verifyToken(token);
                if (!decoded) {
                    resp.code = 400;
                    resp.message = "invalid token";
                    return resp;
                }
                const { email } = decoded as { email: string };
                const user = await UsersModel.findOne({ email: email });
                if (!user) {
                    resp.code = 400;
                    resp.message = "invalid token";
                    return resp;
                }
                const newPassword = Request.body.password;
                if (!newPassword) {
                    resp.code = 400;
                    resp.message = "missing password field";
                    return resp;
                }
                const passwordStrengthCheckResult = passwordStrengthCheck(newPassword);
                if (!passwordStrengthCheckResult.isValid) {
                    resp.code = 400;
                    resp.message = `password does not meet the requirements: ${passwordStrengthCheckResult.missingRequirements.join(", ")}`;
                    return resp;
                }
                const hashedPassword = await generateHashedPassword(newPassword);
                user.password_hash = hashedPassword;
                await user.save();
                resp.message = "password reset successful";
                logger.info(`password reset successful for ${user.email}`);
            }
            catch (error) {
                logger.error(error);
                resp.code = 500;
                resp.message = "internal server error";
            }
        }
        else {
            resp.code = 400;
            resp.message = "invalid method";
        }
        return resp;
    }
}