import Roles from "../enum/role";

export interface AuthResponse {
    data: {
        _id: string;
        role: Roles;
    };
    token: string;
}