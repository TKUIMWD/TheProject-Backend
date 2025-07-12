import { Request } from "express";
import { verifyToken } from "./token";
import { UsersModel } from "../orm/schemas/UserSchemas";
import { resp, createResponse } from "./resp";
import Roles from "../enum/role";

function extractAndValidateToken(Request: Request): {
    token: string | null;
    error?: resp<any>;
} {
    if (!Request || !Request.headers) {
        return {
            token: null,
            error: createResponse(400, "missing authorization header")
        };
    }

    const authHeader = Request.headers.authorization;
    if (!authHeader) {
        return {
            token: null,
            error: createResponse(400, "missing authorization header")
        };
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
        return {
            token: null,
            error: createResponse(400, "missing token in authorization header")
        };
    }

    return { token };
}

function decodeToken(token: string): {
    decoded: any;
    error?: resp<any>;
} {
    let decoded;
    try {
        decoded = verifyToken(token);
    } catch (error) {
        return {
            decoded: null,
            error: createResponse(401, (error as Error).message || "invalid token")
        };
    }

    if (!decoded) {
        return {
            decoded: null,
            error: createResponse(400, "invalid token")
        };
    }

    return { decoded };
}


export async function getTokenRole(Request: Request): Promise<{
    role: Roles | null;
    error?: resp<string | undefined>;
}> {
    const { token, error: tokenError } = extractAndValidateToken(Request);
    if (tokenError) {
        return { role: null, error: tokenError };
    }

    const { decoded, error: decodeError } = decodeToken(token!);
    if (decodeError) {
        return { role: null, error: decodeError };
    }

    const { role } = decoded as { role: Roles };
    return { role };
}

export async function validateTokenAndGetUser<T>(Request: Request): Promise<{
    user: any;
    error?: resp<T | undefined>;
}> {
    const { token, error: tokenError } = extractAndValidateToken(Request);
    if (tokenError) {
        return { user: null, error: tokenError };
    }

    const { decoded, error: decodeError } = decodeToken(token!);
    if (decodeError) {
        return { user: null, error: decodeError };
    }

    const { _id } = decoded as { _id: string };
    const user = await UsersModel.findById(_id);
    if (!user) {
        return {
            user: null,
            error: createResponse(400, "user not found")
        };
    }

    return { user };
}

export async function validatePasswordResetTokenAndGetUser<T>(Request: Request): Promise<{
    user: any;
    error?: resp<T | undefined>;
}> {
    const { token, error: tokenError } = extractAndValidateToken(Request);
    if (tokenError) {
        return { user: null, error: tokenError };
    }

    const { decoded, error: decodeError } = decodeToken(token!);
    if (decodeError) {
        return { user: null, error: decodeError };
    }

    const { email } = decoded as { email: string };
    const user = await UsersModel.findOne({ email: email });
    if (!user) {
        return {
            user: null,
            error: createResponse(400, "invalid token")
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
    const { token, error: tokenError } = extractAndValidateToken(Request);
    if (tokenError) {
        return { user: null, error: tokenError };
    }

    const { decoded, error: decodeError } = decodeToken(token!);
    if (decodeError) {
        return { user: null, error: decodeError };
    }

    const { _id, role } = decoded as { _id: string; role: Roles };
    
    if (!allowedRoles.includes(role)) {
        return {
            user: null,
            error: createResponse(403, "insufficient permissions")
        };
    }

    const user = await UsersModel.findById(_id);
    if (!user) {
        return {
            user: null,
            error: createResponse(400, "invalid token")
        };
    }

    if (user.role !== role) {
        return {
            user: null,
            error: createResponse(403, "permission mismatch")
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