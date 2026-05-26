import { env } from "../../config/env";
import { callWithUnauthorized } from "../../utils/fetch";

type GuacamoleHttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

type GuacamoleRequestOptions = {
    token?: string;
    headers?: HeadersInit;
};

export class GuacamoleApiClient {
    constructor(
        private readonly baseUrl: string = env.guacamole.baseUrl,
        private readonly requester: typeof callWithUnauthorized = callWithUnauthorized
    ) {}

    public async createToken(username: string, password: string): Promise<any> {
        const body = new URLSearchParams({ username, password });
        return this.requester<any>('POST', this.url('/api/tokens'), body, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
    }

    public async request<T = any>(
        method: GuacamoleHttpMethod,
        path: string,
        body?: Record<string, unknown> | Record<string, unknown>[],
        options: GuacamoleRequestOptions = {}
    ): Promise<T> {
        return this.requester<T>(method, this.url(path), body, {
            headers: {
                ...this.authHeaders(options.token),
                ...this.normalizeHeaders(options.headers)
            }
        });
    }

    public async getUser(dataSource: string, username: string, token: string): Promise<any> {
        return this.request('GET', `/api/session/data/${encodeURIComponent(dataSource)}/users/${encodeURIComponent(username)}`, undefined, { token });
    }

    public async createUser(dataSource: string, userData: Record<string, unknown>, token: string): Promise<any> {
        return this.request('POST', `/api/session/data/${encodeURIComponent(dataSource)}/users`, userData, { token });
    }

    public async getUserPermissions(dataSource: string, username: string, token: string): Promise<any> {
        return this.request('GET', `/api/session/data/${encodeURIComponent(dataSource)}/users/${encodeURIComponent(username)}/permissions`, undefined, { token });
    }

    public async patchUserPermissions(dataSource: string, username: string, operations: Record<string, unknown>[], token: string): Promise<any> {
        return this.request('PATCH', `/api/session/data/${encodeURIComponent(dataSource)}/users/${encodeURIComponent(username)}/permissions`, operations, { token });
    }

    public async listConnections(dataSource: string, token: string): Promise<any> {
        return this.request('GET', `/api/session/data/${encodeURIComponent(dataSource)}/connections`, undefined, { token });
    }

    public async createConnection(dataSource: string, connectionConfig: Record<string, unknown>, token: string): Promise<any> {
        return this.request('POST', `/api/session/data/${encodeURIComponent(dataSource)}/connections`, connectionConfig, { token });
    }

    public async getConnection(dataSource: string, connectionId: string, token: string): Promise<any> {
        return this.request('GET', `/api/session/data/${encodeURIComponent(dataSource)}/connections/${encodeURIComponent(connectionId)}`, undefined, { token });
    }

    public async deleteConnection(dataSource: string, connectionId: string, token: string): Promise<any> {
        return this.request('DELETE', `/api/session/data/${encodeURIComponent(dataSource)}/connections/${encodeURIComponent(connectionId)}`, undefined, { token });
    }

    public async deleteActiveConnection(dataSource: string, connectionId: string, token: string): Promise<any> {
        return this.request(
            'PATCH',
            `/api/session/data/${encodeURIComponent(dataSource)}/activeConnections/${encodeURIComponent(connectionId)}`,
            { operations: [{ op: 'remove', path: '/' }] },
            {
                token,
                headers: {
                    'Content-Type': 'application/json-patch+json'
                }
            }
        );
    }

    private authHeaders(token?: string): Record<string, string> {
        return token ? { 'Guacamole-Token': token } : {};
    }

    private url(path: string): string {
        return `${this.baseUrl}${path}`;
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

export const guacamoleApiClient = new GuacamoleApiClient();
