import jwt from 'jsonwebtoken';

import Roles from '../enum/role';
import { env } from '../config/env';

const secret = env.security.jwtSecret;

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
        if (error instanceof jwt.TokenExpiredError) {
            throw new Error('token expired');
        } else if (error instanceof jwt.JsonWebTokenError) {
            throw new Error('invalid token');
        } else {
            throw new Error('token verification failed');
        }
    }
}
