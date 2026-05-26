export type AIResponseLanguage = 'zh-Hant' | 'zh-Hans' | 'ja' | 'ko' | 'en';

export function detectResponseLanguage(input: string): AIResponseLanguage {
    if (/[\uAC00-\uD7AF]/.test(input)) {
        return 'ko';
    }

    if (/[\u3040-\u30FF]/.test(input)) {
        return 'ja';
    }

    if (/[\u4E00-\u9FFF]/.test(input)) {
        const simplifiedSignals = /[这为会汉语无与吗国后发复]/;
        const traditionalSignals = /[這為會漢語無與嗎國後發復]/;
        if (simplifiedSignals.test(input) && !traditionalSignals.test(input)) {
            return 'zh-Hans';
        }
        return 'zh-Hant';
    }

    return 'en';
}

export function languageName(language: AIResponseLanguage): string {
    const names: Record<AIResponseLanguage, string> = {
        'zh-Hant': 'Traditional Chinese',
        'zh-Hans': 'Simplified Chinese',
        ja: 'Japanese',
        ko: 'Korean',
        en: 'English'
    };
    return names[language];
}

export function buildLanguageInstruction(userInput: string): string {
    const language = detectResponseLanguage(userInput);
    const detectedLanguageName = languageName(language);
    return `LANGUAGE CONTROL:
- Detected response language: ${detectedLanguageName}.
- Reply in ${detectedLanguageName} unless the user explicitly asks for a different language.
- If the input mixes languages, use the language of the user's request sentence while preserving technical terms, product names, code, commands, and CVE identifiers as written.
- Do not switch to English just because system context, role context, VM inventory, or Box design context is in English.`;
}

export function isChineseResponse(language: AIResponseLanguage): boolean {
    return language === 'zh-Hant' || language === 'zh-Hans';
}

export function isJapaneseResponse(language: AIResponseLanguage): boolean {
    return language === 'ja';
}

export function isKoreanResponse(language: AIResponseLanguage): boolean {
    return language === 'ko';
}
