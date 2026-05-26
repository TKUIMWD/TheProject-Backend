import Roles from "../../enum/role";

export function canModerateVMBox(userRole: unknown, userId: unknown, boxSubmitterUserId: unknown): boolean {
    if (userRole === Roles.SuperAdmin) {
        return true;
    }

    return userRole === Roles.Admin &&
        typeof userId === "string" &&
        typeof boxSubmitterUserId === "string" &&
        boxSubmitterUserId === userId;
}

export function canModifyBoxWriteup(userId: unknown, writeupAuthorUserId: unknown): boolean {
    return typeof userId === "string" &&
        typeof writeupAuthorUserId === "string" &&
        writeupAuthorUserId === userId;
}
