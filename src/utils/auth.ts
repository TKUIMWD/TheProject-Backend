import { Request } from "express";
import { verifyToken } from "./token";
import { UsersModel } from "../orm/schemas/UserSchemas";

export async function getUserFromRequest(Request: Request) {
    const authHeader = Request.headers.authorization;
    if (!authHeader) return null;
    const token = authHeader.split(" ")[1];
    const decoded = verifyToken(token);
    if (!decoded) return null;
    const { _id } = decoded as { _id: string };
    const user = await UsersModel.findById(_id);
    return user;
}