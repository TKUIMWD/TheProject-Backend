require('dotenv').config();
import jwt from 'jsonwebtoken';

import Roles from '../enum/role';

const secret = process.env.JWT_SECRET;

if (!secret) {
    throw new Error('JWT_SECRET is not defined in the environment variables');
}

export const generateToken = (_id: string, role: Roles , username:string):string => {
    return jwt.sign({ _id, username, role }, secret, { expiresIn: '1d' });
}

export const generateVerificationToken = (_id: string):string => {
    return jwt.sign({ _id }, secret, { expiresIn: '10m' });
}

export const generatePasswordResetToken = (email: string):string => {
    return jwt.sign({ email }, secret, { expiresIn: '10m' });
}

export const verifyToken = (token: string) => {
    try {
        return jwt.verify(token, secret);
    } catch (error) {
        throw new Error('invalid or expired token');
    }
}