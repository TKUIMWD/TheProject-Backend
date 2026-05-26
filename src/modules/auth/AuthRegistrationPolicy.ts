export type RegistrationConflict =
    | { conflict: false }
    | { conflict: true; reason: "unverified_email" | "existing_identity" };

type RegisterInput = {
    username?: unknown;
    email?: unknown;
    password?: unknown;
};

type ExistingRegistrationUser = {
    username?: unknown;
    email?: unknown;
    isVerified?: unknown;
};

export function collectMissingRegistrationFields(input: RegisterInput): string[] {
    const missingFields: string[] = [];
    if (!input.username) {
        missingFields.push("username");
    }
    if (!input.email) {
        missingFields.push("email");
    }
    if (!input.password) {
        missingFields.push("password");
    }
    return missingFields;
}

export function classifyRegistrationConflict(
    existingUsers: ExistingRegistrationUser[],
    input: { username: string; email: string }
): RegistrationConflict {
    const existingEmail = existingUsers.find((user) => user.email === input.email);
    if (existingEmail?.isVerified === false) {
        return { conflict: true, reason: "unverified_email" };
    }

    const hasExistingIdentity = existingUsers.some((user) =>
        user.username === input.username || user.email === input.email
    );

    if (hasExistingIdentity) {
        return { conflict: true, reason: "existing_identity" };
    }

    return { conflict: false };
}
