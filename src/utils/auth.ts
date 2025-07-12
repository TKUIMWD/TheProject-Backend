import { Request } from "express";
import { verifyToken } from "./token";
import { UsersModel } from "../orm/schemas/UserSchemas";
import { resp } from "./resp";
import Roles from "../enum/role";

export async function validateTokenAndGetUser<T>(Request: Request): Promise<{
    user: any;
    error?: resp<T | undefined>;
}> {
    if (!Request || !Request.headers) {
        return {
            user: null,
            error: {
                code: 400,
                message: "missing authorization header",
                body: undefined
            }
        };
    }

    const authHeader = Request.headers.authorization;
    if (!authHeader) {
        return {
            user: null,
            error: {
                code: 400,
                message: "missing authorization header",
                body: undefined
            }
        };
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
        return {
            user: null,
            error: {
                code: 400,
                message: "missing token in authorization header",
                body: undefined
            }
        };
    }

    let decoded;
    try {
        decoded = verifyToken(token);
    } catch (error) {
        return {
            user: null,
            error: {
                code: 401,
                message: (error as Error).message || "invalid token",
                body: undefined
            }
        };
    }

    if (!decoded) {
        return {
            user: null,
            error: {
                code: 400,
                message: "invalid token",
                body: undefined
            }
        };
    }

    const { _id } = decoded as { _id: string };
    const user = await UsersModel.findById(_id);
    if (!user) {
        return {
            user: null,
            error: {
                code: 400,
                message: "user not found",
                body: undefined
            }
        };
    }

    return { user };
}

export async function validatePasswordResetTokenAndGetUser<T>(Request: Request): Promise<{
    user: any;
    error?: resp<T | undefined>;
}> {
    if (!Request || !Request.headers) {
        return {
            user: null,
            error: {
                code: 400,
                message: "missing authorization header",
                body: undefined
            }
        };
    }

    const authHeader = Request.headers.authorization;
    if (!authHeader) {
        return {
            user: null,
            error: {
                code: 400,
                message: "missing authorization header",
                body: undefined
            }
        };
    }

    const token = authHeader.split(" ")[1];
    let decoded;
    try {
        decoded = verifyToken(token);
    } catch (error) {
        return {
            user: null,
            error: {
                code: 400,
                message: "invalid token",
                body: undefined
            }
        };
    }

    if (!decoded) {
        return {
            user: null,
            error: {
                code: 400,
                message: "invalid token",
                body: undefined
            }
        };
    }

    const { email } = decoded as { email: string };
    const user = await UsersModel.findOne({ email: email });
    if (!user) {
        return {
            user: null,
            error: {
                code: 400,
                message: "invalid token",
                body: undefined
            }
        };
    }

    return { user };
}

export async function validateTokenAndGetUserWithPermission<T>(
    Request: Request, 
    allowedRoles: Roles[]
): Promise<{
    user: any;
    error?: resp<T | undefined>;
}> {
    if (!Request || !Request.headers) {
        return {
            user: null,
            error: {
                code: 400,
                message: "missing authorization header",
                body: undefined
            }
        };
    }

    const authHeader = Request.headers.authorization;
    if (!authHeader) {
        return {
            user: null,
            error: {
                code: 400,
                message: "missing authorization header",
                body: undefined
            }
        };
    }

    const token = authHeader.split(" ")[1];
    let decoded;
    try {
        decoded = verifyToken(token);
    } catch (error) {
        return {
            user: null,
            error: {
                code: 400,
                message: "invalid token",
                body: undefined
            }
        };
    }

    if (!decoded) {
        return {
            user: null,
            error: {
                code: 400,
                message: "invalid token",
                body: undefined
            }
        };
    }

    const { _id, role } = decoded as { _id: string; role: Roles };
    
    if (!allowedRoles.includes(role)) {
        return {
            user: null,
            error: {
                code: 403,
                message: "insufficient permissions",
                body: undefined
            }
        };
    }

    const user = await UsersModel.findById(_id);
    if (!user) {
        return {
            user: null,
            error: {
                code: 400,
                message: "invalid token",
                body: undefined
            }
        };
    }

    if (user.role !== role) {
        return {
            user: null,
            error: {
                code: 403,
                message: "permission mismatch",
                body: undefined
            }
        };
    }

    return { user };
}

export async function validateTokenAndGetAdminUser<T>(Request: Request): Promise<{
    user: any;
    error?: resp<T | undefined>;
}> {
    return validateTokenAndGetUserWithPermission<T>(Request, [Roles.Admin, Roles.SuperAdmin]);
}

export async function validateTokenAndGetSuperAdminUser<T>(Request: Request): Promise<{
    user: any;
    error?: resp<T | undefined>;
}> {
    return validateTokenAndGetUserWithPermission<T>(Request, [Roles.SuperAdmin]);
}