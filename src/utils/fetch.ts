const api_base = process.env.BACKEND_BASE_URL || 'http://localhost:22100';

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
        console.error(error);
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
        console.error(error);
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
        console.error(error);
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
        console.error(error);
    }
}

type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export async function callWithUnauthorized<T = unknown>(
    method: HTTPMethod,
    url: string,
    body?: Record<string, unknown> | FormData,
    options: RequestOptions = {}
): Promise<T> {
    // 臨時禁用 SSL 驗證
    const originalValue = process.env.NODE_TLS_REJECT_UNAUTHORIZED || '1';
    try {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

        let response: Response;
        switch (method) {
            case 'GET':
                response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'Access-Control-Allow-Origin': api_base,
                        'Content-Type': 'application/json',
                        ...options.headers,
                    },
                    mode: 'cors',
                });
                break;
            case 'POST':
                response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Access-Control-Allow-Origin': api_base,
                        'Content-Type': body instanceof FormData ? 'multipart/form-data' : 'application/json',
                        ...options.headers,
                    },
                    body: body instanceof FormData ? body : JSON.stringify(body),
                    mode: 'cors',
                });
                break;
            case 'PUT':
                response = await fetch(url, {
                    method: 'PUT',
                    headers: {
                        'Access-Control-Allow-Origin': api_base,
                        'Content-Type': body instanceof FormData ? 'multipart/form-data' : 'application/json',
                        ...options.headers,
                    },
                    body: body instanceof FormData ? body : JSON.stringify(body),
                    mode: 'cors',
                });
                break;
            case 'DELETE':
                response = await fetch(url, {
                    method: 'DELETE',
                    headers: {
                        'Access-Control-Allow-Origin': api_base,
                        'Content-Type': body instanceof FormData ? 'multipart/form-data' : 'application/json',
                        ...options.headers,
                    },
                    body: body instanceof FormData ? body : JSON.stringify(body),
                    mode: 'cors',
                });
                break;
            case 'PATCH':
                response = await fetch(url, {
                    method: 'PATCH',
                    headers: {
                        'Access-Control-Allow-Origin': api_base,
                        'Content-Type': body instanceof FormData ? 'multipart/form-data' : 'application/json',
                        ...options.headers,
                    },
                    body: body instanceof FormData ? body : JSON.stringify(body),
                    mode: 'cors',
                });
                break;
            default:
                throw new Error(`Unsupported HTTP method: ${method}`);
        }

        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            return await response.json() as T;
        } else if (contentType && contentType.includes('text/')) {
            return await response.text() as T;
        } else if (contentType && contentType.includes('application/octet-stream')) {
            return await response.arrayBuffer() as T;
        } else {
            // fallback to text
            return await response.text() as T;
        }
    } finally {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalValue;
    }
}
