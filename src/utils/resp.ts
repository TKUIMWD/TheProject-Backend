export interface resp<E> {
    code: number,
    message: string,
    body: E
}

export function createResponse<T>(code: number = 200, message: string = "", body?: T): resp<T | undefined> {
    return {
        code,
        message,
        body
    };
}