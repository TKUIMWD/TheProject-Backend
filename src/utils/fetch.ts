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

export async function asyncPatch(api: string, body: {} | FormData) {
    const res: Response = await fetch(api, {
        method: 'PATCH',
        headers:new Headers({
            'Access-Control-Allow-Origin':api_base,
        }),
        body: body instanceof FormData?body:JSON.stringify(body),
        mode:"cors"
    })
    try {
        let data = res.json()
        return data
    } catch (error) {
        console.error(error)
    }
}