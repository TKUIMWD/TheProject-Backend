export type PVEResp<T = any> = T & {
    success?: number;
    errors?: { [key: string]: string };
    data?: T;
};
