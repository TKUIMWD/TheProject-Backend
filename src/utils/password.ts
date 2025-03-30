import bcrypt from "bcrypt";

export async function generateHashedPassword(password:string):Promise<string> {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    return hashedPassword;
}