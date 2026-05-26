import http from "http";
import https from "https";
import { env } from "../config/env";
import { logger } from "../middlewares/log";

const api_base = env.server.backendBaseUrl;

interface RequestOptions {
    headers?: HeadersInit;
}

/**
 * 異步呼叫api, 只可用響應體為 json 的 api
 * @param api 要呼叫的api
 * @param options 可選的請求選項
 * @returns json 結果
 */
export async function asyncGet(api: string, options: RequestOptions = {}): Promise<any> {
    try {
        const res: Response = await fetch(api, {
            method: 'GET',
            headers: {
                'Access-Control-Allow-Origin': api_base,
                'Content-Type': 'application/json',
                ...options.headers,
            },
            mode: 'cors',
        });
        try {
            return await res.json();
        } catch (error) {
            return error;
        }
    } catch (error) {
        return error;
    }
}

export async function asyncPost(api: string, body: {} | FormData, options: RequestOptions = {}): Promise<any> {
    const res: Response = await fetch(api, {
        method: 'POST',
        headers: {
            'Access-Control-Allow-Origin': api_base,
            'Content-Type': body instanceof FormData ? 'multipart/form-data' : 'application/json',
            ...options.headers,
        },
        body: body instanceof FormData ? body : JSON.stringify(body),
        mode: 'cors',
    });
    try {
        let data = await res.json();
        return data;
    } catch (error) {
        logger.warn("Failed to parse POST response as JSON:", error);
    }
}

export async function asyncPut(api: string, body: {} | FormData, options: RequestOptions = {}): Promise<any> {
    const res: Response = await fetch(api, {
        method: 'PUT',
        headers: {
            'Access-Control-Allow-Origin': api_base,
            'Content-Type': body instanceof FormData ? 'multipart/form-data' : 'application/json',
            ...options.headers,
        },
        body: body instanceof FormData ? body : JSON.stringify(body),
        mode: 'cors',
    });
    try {
        let data = await res.json();
        return data;
    } catch (error) {
        logger.warn("Failed to parse PUT response as JSON:", error);
    }
}


export async function asyncDelete(api: string, body: {} | FormData, options: RequestOptions = {}): Promise<any> {
    const res: Response = await fetch(api, {
        method: 'DELETE',
        headers: {
            'Access-Control-Allow-Origin': api_base,
            'Content-Type': body instanceof FormData ? 'multipart/form-data' : 'application/json',
            ...options.headers,
        },
        body: body instanceof FormData ? body : JSON.stringify(body),
        mode: 'cors',
    });
    try {
        let data = await res.json();
        return data;
    } catch (error) {
        logger.warn("Failed to parse DELETE response as JSON:", error);
    }
}

export async function asyncPatch(api: string, body: {} | FormData, options: RequestOptions = {}): Promise<any> {
    const res: Response = await fetch(api, {
        method: 'PATCH',
        headers: {
            'Access-Control-Allow-Origin': api_base,
            'Content-Type': body instanceof FormData ? 'multipart/form-data' : 'application/json',
            ...options.headers,
        },
        body: body instanceof FormData ? body : JSON.stringify(body),
        mode: 'cors',
    });
    try {
        let data = await res.json();
        return data;
    } catch (error) {
        logger.warn("Failed to parse PATCH response as JSON:", error);
    }
}

type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export async function callWithUnauthorized<T = unknown>(
    method: HTTPMethod,
    url: string,
    body?: Record<string, unknown> | Record<string, unknown>[] | FormData | URLSearchParams,
    options: RequestOptions = {}
): Promise<T> {
    if (body instanceof FormData) {
        const response = await fetch(url, {
            method,
            headers: {
                'Access-Control-Allow-Origin': api_base,
                ...options.headers,
            },
            body,
            mode: 'cors',
        });
        return parseFetchResponse<T>(response);
    }

    return requestWithOptionalInsecureTls<T>(method, url, body, options);
}

async function parseFetchResponse<T>(response: Response): Promise<T> {
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
        return await response.json() as T;
    } else if (contentType && contentType.includes('text/')) {
        return await response.text() as T;
    } else if (contentType && contentType.includes('application/octet-stream')) {
        return await response.arrayBuffer() as T;
    }
    return await response.text() as T;
}

function requestWithOptionalInsecureTls<T>(
    method: HTTPMethod,
    url: string,
    body?: Record<string, unknown> | Record<string, unknown>[] | URLSearchParams,
    options: RequestOptions = {}
): Promise<T> {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const payload = body === undefined
            ? undefined
            : body instanceof URLSearchParams
                ? body.toString()
                : JSON.stringify(body);
        const headers: Record<string, string> = {
            'Access-Control-Allow-Origin': api_base,
            'Content-Type': body instanceof URLSearchParams ? 'application/x-www-form-urlencoded' : 'application/json',
            ...normalizeHeaders(options.headers)
        };
        if (payload) headers['Content-Length'] = Buffer.byteLength(payload).toString();

        const requestOptions: http.RequestOptions | https.RequestOptions = {
            method,
            protocol: parsedUrl.protocol,
            hostname: parsedUrl.hostname,
            port: parsedUrl.port,
            path: `${parsedUrl.pathname}${parsedUrl.search}`,
            headers
        };

        if (parsedUrl.protocol === 'https:' && env.http.allowInsecureTls) {
            (requestOptions as https.RequestOptions).agent = new https.Agent({ rejectUnauthorized: false });
        }

        const transport = parsedUrl.protocol === 'https:' ? https : http;
        const req = transport.request(requestOptions, res => {
            const chunks: Buffer[] = [];
            res.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
            res.on('end', () => {
                const contentType = res.headers['content-type'] || '';
                const raw = Buffer.concat(chunks);
                const text = raw.toString('utf8');

                if (typeof contentType === 'string' && contentType.includes('application/json')) {
                    try {
                        resolve(JSON.parse(text) as T);
                    } catch (error) {
                        reject(error);
                    }
                    return;
                }

                if (typeof contentType === 'string' && contentType.includes('application/octet-stream')) {
                    resolve(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as T);
                    return;
                }

                resolve(text as T);
            });
        });

        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

function normalizeHeaders(headers?: HeadersInit): Record<string, string> {
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
