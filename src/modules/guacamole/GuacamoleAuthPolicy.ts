import { GuacamoleAuthToken } from "../../interfaces/Guacamole";

export const DEFAULT_GUACAMOLE_DATA_SOURCE = "postgresql";

export type GuacamoleAuthTokenDecision =
    | { success: true; authToken: GuacamoleAuthToken }
    | { success: false; message: string };

export function buildGuacamoleAuthTokenDecision(response: unknown, input: {
    username: string;
    fallbackDataSource?: string;
    errorPrefix: string;
    missingTokenMessage: string;
}): GuacamoleAuthTokenDecision {
    const payload = response as any;

    if (payload?.error) {
        return {
            success: false,
            message: `${input.errorPrefix}: ${payload.error}`
        };
    }

    const token = payload?.authToken || payload?.token;
    if (!token) {
        return {
            success: false,
            message: input.missingTokenMessage
        };
    }

    return {
        success: true,
        authToken: {
            token: String(token),
            dataSource: payload?.dataSource || input.fallbackDataSource || DEFAULT_GUACAMOLE_DATA_SOURCE,
            username: input.username
        }
    };
}
