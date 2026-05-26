import { env } from "../../config/env";
import { callWithUnauthorized } from "../../utils/fetch";

export type PVEHttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
export type PVETokenMode = 'user' | 'admin' | 'superAdmin';

export type PVEClientRequestOptions = {
    mode?: PVETokenMode;
    headers?: HeadersInit;
};

type PVERequestBody = Record<string, unknown> | FormData | undefined;

export class PVEClient {
    constructor(
        private readonly requester: typeof callWithUnauthorized = callWithUnauthorized
    ) {}

    public async request<T = unknown>(
        method: PVEHttpMethod,
        url: string,
        body?: PVERequestBody,
        options: PVEClientRequestOptions = {}
    ): Promise<T> {
        const mode = options.mode || 'superAdmin';
        return this.requester<T>(method, url, body, {
            headers: {
                'Authorization': `PVEAPIToken=${this.getToken(mode)}`,
                ...this.normalizeHeaders(options.headers)
            }
        });
    }

    public getToken(mode: PVETokenMode): string {
        switch (mode) {
            case 'user':
                return env.pve.userModeToken;
            case 'admin':
                return env.pve.adminModeToken;
            case 'superAdmin':
                return env.pve.superAdminModeToken;
            default:
                return env.pve.superAdminModeToken;
        }
    }

    private normalizeHeaders(headers?: HeadersInit): Record<string, string> {
        if (!headers) return {};
        if (headers instanceof Headers) {
            const result: Record<string, string> = {};
            headers.forEach((value, key) => {
                result[key] = value;
            });
            return result;
        }
        if (Array.isArray(headers)) {
            return Object.fromEntries(headers.map(([key, value]) => [key, value]));
        }
        return headers as Record<string, string>;
    }
}

export const pveClient = new PVEClient();
