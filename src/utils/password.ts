import bcrypt from "bcrypt";

export async function generateHashedPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    return hashedPassword;
}

export interface PasswordStrengthCheckResult {
    isValid: boolean;
    missingRequirements: string[];
}

export function passwordStrengthCheck(password: string): PasswordStrengthCheckResult {
    const missingRequirements: string[] = [];

    // 檢查長度
    if (password.length < 8) {
        missingRequirements.push("至少需要8個字元");
    }

    // 檢查大寫字母
    if (!/[A-Z]/.test(password)) {
        missingRequirements.push("至少需要一個大寫字母");
    }

    // 檢查小寫字母
    if (!/[a-z]/.test(password)) {
        missingRequirements.push("至少需要一個小寫字母");
    }

    // 檢查數字
    if (!/\d/.test(password)) {
        missingRequirements.push("至少需要一個數字");
    }

    // 檢查特殊字元
    if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
        missingRequirements.push("至少需要一個特殊字元");
    }

    return {
        isValid: missingRequirements.length === 0,
        missingRequirements
    };
}