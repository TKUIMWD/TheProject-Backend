import { describe, expect, it } from "vitest";
import {
    buildLanguageInstruction,
    detectResponseLanguage,
    isChineseResponse,
    isJapaneseResponse,
    isKoreanResponse,
    languageName
} from "../src/modules/ai-chat/AIChatLanguagePolicy";

describe("AIChatLanguagePolicy", () => {
    it("detects supported response languages", () => {
        expect(detectResponseLanguage("請幫我看這台 VM")).toBe("zh-Hant");
        expect(detectResponseLanguage("请帮我看这台 VM")).toBe("zh-Hans");
        expect(detectResponseLanguage("この VM を確認して")).toBe("ja");
        expect(detectResponseLanguage("이 VM 상태를 확인해줘")).toBe("ko");
        expect(detectResponseLanguage("Please check this VM")).toBe("en");
    });

    it("maps language codes to display names", () => {
        expect(languageName("zh-Hant")).toBe("Traditional Chinese");
        expect(languageName("zh-Hans")).toBe("Simplified Chinese");
        expect(languageName("ja")).toBe("Japanese");
        expect(languageName("ko")).toBe("Korean");
        expect(languageName("en")).toBe("English");
    });

    it("builds language control instructions from user input", () => {
        expect(buildLanguageInstruction("請用繁體中文回答")).toContain("Detected response language: Traditional Chinese");
        expect(buildLanguageInstruction("Please answer in English")).toContain("Reply in English");
    });

    it("groups localized response helpers", () => {
        expect(isChineseResponse("zh-Hant")).toBe(true);
        expect(isChineseResponse("zh-Hans")).toBe(true);
        expect(isChineseResponse("en")).toBe(false);
        expect(isJapaneseResponse("ja")).toBe(true);
        expect(isKoreanResponse("ko")).toBe(true);
    });
});
