import { Document } from "mongoose";
import { DBResp } from "../../interfaces/Response/DBResp";
import { logger } from "../../middlewares/log";
import { ComputeResourcePlanModel } from "../../orm/schemas/ComputeResourcePlanSchemas";
import { UsersModel } from "../../orm/schemas/UserSchemas";
import { sendVerificationEmail } from "../../utils/MailSender/VerificationTokenSender";
import { generateHashedPassword, passwordStrengthCheck } from "../../utils/password";
import { createResponse, resp } from "../../utils/resp";
import { generateVerificationToken } from "../../utils/token";
import {
    classifyRegistrationConflict,
    collectMissingRegistrationFields
} from "./AuthRegistrationPolicy";

type RegisterInput = {
    username: string;
    email: string;
    password: string;
};

type RegistrationUser = {
    _id: any;
    username: string;
    email: string;
    lastTimeVerifyEmailSent?: Date;
    save(): Promise<unknown>;
};

type AuthRegistrationRepository = {
    listConflictingUsers(username: string, email: string): Promise<any[]>;
    findStandardComputeResourcePlan(): Promise<(Document & { _id?: any }) | null>;
    createUser(input: Record<string, unknown>): RegistrationUser;
};

type PasswordStrengthChecker = (password: string) => { isValid: boolean; missingRequirements: string[] };
type PasswordHasher = (password: string) => Promise<string>;
type TokenGenerator = (userId: any) => string;
type VerificationSender = (email: string, token: string) => void;

type AuthRegistrationServiceDeps = {
    repo?: AuthRegistrationRepository;
    checkPasswordStrength?: PasswordStrengthChecker;
    hashPassword?: PasswordHasher;
    generateToken?: TokenGenerator;
    sendVerification?: VerificationSender;
    now?: () => Date;
};

const authRegistrationRepository: AuthRegistrationRepository = {
    async listConflictingUsers(username: string, email: string): Promise<any[]> {
        return UsersModel.find({
            $or: [
                { username },
                { email }
            ]
        }).lean().exec();
    },
    async findStandardComputeResourcePlan(): Promise<(Document & { _id?: any }) | null> {
        try {
            return ComputeResourcePlanModel.findOne({ name: "standard" }).exec() as any;
        } catch (error) {
            logger.error("Error fetching standard compute resource plan:", error);
            return null;
        }
    },
    createUser(input: Record<string, unknown>): RegistrationUser {
        return new UsersModel(input) as any;
    }
};

export class AuthRegistrationService {
    private readonly repo: AuthRegistrationRepository;
    private readonly checkPasswordStrength: PasswordStrengthChecker;
    private readonly hashPassword: PasswordHasher;
    private readonly generateToken: TokenGenerator;
    private readonly sendVerification: VerificationSender;
    private readonly now: () => Date;

    constructor(deps: AuthRegistrationServiceDeps = {}) {
        this.repo = deps.repo ?? authRegistrationRepository;
        this.checkPasswordStrength = deps.checkPasswordStrength ?? passwordStrengthCheck;
        this.hashPassword = deps.hashPassword ?? generateHashedPassword;
        this.generateToken = deps.generateToken ?? generateVerificationToken;
        this.sendVerification = deps.sendVerification ?? sendVerificationEmail;
        this.now = deps.now ?? (() => new Date());
    }

    public async register(data: RegisterInput): Promise<resp<DBResp<Document> | undefined>> {
        try {
            const { username, email, password } = data;
            const missingFields = collectMissingRegistrationFields(data);
            if (missingFields.length > 0) {
                return createResponse(400, `missing required fields: ${missingFields.join(", ")}`);
            }

            const existingUsers = await this.repo.listConflictingUsers(username, email);
            const conflict = classifyRegistrationConflict(existingUsers, { username, email });
            if (conflict.conflict) {
                if (conflict.reason === "unverified_email") {
                    logger.warn(`someone tried to register with existing email but not verified: ${email}`);
                    return createResponse(400, "email already exists but not verified , please verify your email");
                }
                logger.warn(`someone tried to register with existing username or email: ${username}, ${email}`);
                return createResponse(400, "cannot register");
            }

            const passwordStrengthCheckResult = this.checkPasswordStrength(password);
            if (!passwordStrengthCheckResult.isValid) {
                return createResponse(400, `password does not meet the requirements: ${passwordStrengthCheckResult.missingRequirements.join(", ")}`);
            }

            const hashedPassword = await this.hashPassword(password);
            const standardPlan = await this.repo.findStandardComputeResourcePlan();
            if (!standardPlan) {
                logger.error("Standard compute resource plan not found or error occurred");
                return createResponse(500, "Default compute resource plan not available");
            }
            logger.info(`Assigning standard compute resource plan (ID: ${standardPlan._id}) to user: ${username}`);

            const newUser = this.repo.createUser({
                username,
                password_hash: hashedPassword,
                email,
                isVerified: false,
                registeredAt: this.now(),
                compute_resource_plan_id: standardPlan._id
            });

            await newUser.save();
            logger.info(`user registered successfully: ${username}`);

            if (this.canSendEmail(newUser.lastTimeVerifyEmailSent, 5)) {
                this.sendVerification(newUser.email, this.generateToken(newUser._id));
                newUser.lastTimeVerifyEmailSent = this.now();
                await newUser.save();
                return createResponse(200, "user registered successfully");
            }

            const minutesLeft = newUser.lastTimeVerifyEmailSent
                ? Math.ceil((newUser.lastTimeVerifyEmailSent.getTime() + 5 * 60 * 1000 - this.now().getTime()) / 60000)
                : 5;
            return createResponse(400, `please wait ${minutesLeft} minute(s) before resending the verification email`);
        } catch (error) {
            logger.error(error);
            return createResponse(500, "internal server error");
        }
    }

    public canSendEmail(lastTimeSent: Date | null | undefined, intervalMinutes: number): boolean {
        if (!lastTimeSent) return true;
        const diffMs = this.now().getTime() - lastTimeSent.getTime();
        const diffMinutes = diffMs / (1000 * 60);
        return diffMinutes >= intervalMinutes;
    }
}

export const authRegistrationService = new AuthRegistrationService();
