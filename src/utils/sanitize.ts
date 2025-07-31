import { JSDOM } from 'jsdom';
import DOMPurify from 'dompurify';

const window = new JSDOM('').window;
const purify = DOMPurify(window);

/**
 * @description Sanitizes a single string to prevent XSS attacks by removing all HTML tags.
 * @param input The raw string from user input. Can be a string, null, or undefined.
 * @returns A sanitized, plain text string. Returns an empty string if the input is falsy (null, undefined, '').
 */
export const sanitizeString = (input: string | null | undefined): string => {
    if (!input) {
        return '';
    }
    return purify.sanitize(input);
};

/**
 * @description Applies sanitization to each string in an array.
 * @param inputs The raw string array from user input.
 * @returns A new array with each string sanitized. Returns an empty array if input is falsy.
 */
export const sanitizeArray = (inputs: (string | null | undefined)[] | null | undefined): string[] => {
    if (!inputs) {
        return [];
    }
    return inputs.map(item => sanitizeString(item));
};