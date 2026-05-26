import { describe, expect, it } from "vitest";
import {
    buildReferenceFallbackWorkspaceFiles,
    extractReferenceBundlePath,
    normalizeReferenceFallbackWriteup,
    safeReferenceBundleName,
    sanitizeReferenceFallbackDoc,
    shouldIgnoreReferenceEntry
} from "../src/modules/ai-box-build/AIBoxBuildReferencePolicy";

describe("AIBoxBuildReferencePolicy", () => {
    it("extracts English reference bundle path markers", () => {
        expect(extractReferenceBundlePath("reference_bundle_path: /refs/midterm")).toBe("/refs/midterm");
        expect(extractReferenceBundlePath("reference path = ` /refs/lab `")).toBe(" /refs/lab ");
    });

    it("extracts Traditional Chinese reference path markers", () => {
        expect(extractReferenceBundlePath("參考素材路徑：'/refs/素材包'")).toBe("/refs/素材包");
        expect(extractReferenceBundlePath("參考檔案路徑: \"/refs/files\"")).toBe("/refs/files");
    });

    it("returns an empty string when no marker is present", () => {
        expect(extractReferenceBundlePath("Use the standard build context.")).toBe("");
    });

    it("normalizes unsafe reference bundle folder names", () => {
        expect(safeReferenceBundleName("/tmp/references/114-2 midterm v2")).toBe("114-2_midterm_v2");
        expect(safeReferenceBundleName("/tmp/references/測試包")).toBe("___");
    });

    it("identifies generated or dependency folders that should be ignored", () => {
        expect(shouldIgnoreReferenceEntry(".git")).toBe(true);
        expect(shouldIgnoreReferenceEntry("node_modules")).toBe(true);
        expect(shouldIgnoreReferenceEntry(".venv")).toBe(true);
        expect(shouldIgnoreReferenceEntry("__pycache__")).toBe(true);
        expect(shouldIgnoreReferenceEntry("Lab")).toBe(false);
    });

    it("sanitizes reference fallback draft markers and ungenerated flag placeholders", () => {
        expect(sanitizeReferenceFallbackDoc("TODO: fix\nTODO later\nYOUR_FLAGS_HAVE_NOT_BEEN_GENERATED")).toBe(
            "Intentional draft note: fix\nDraft note later\nFLAGS_ARE_GENERATED_DURING_SETUP"
        );
    });

    it("normalizes reference fallback writeup hostnames and local IPs", () => {
        expect(normalizeReferenceFallbackWriteup("Visit flow.htb, flowise.flow.htb, and 192.168.92.129")).toBe(
            "Visit flow.ethci, flowise.flow.ethci, and target VM IP"
        );
    });

    it("provides a fallback writeup when the reference writeup is empty", () => {
        expect(normalizeReferenceFallbackWriteup("")).toContain("Reference writeup unavailable.");
    });

    it("builds sanitized reference fallback workspace markdown files", () => {
        const files = buildReferenceFallbackWorkspaceFiles({
            reason: "opencode run failed",
            referenceSetup: "TODO: install\nYOUR_FLAGS_HAVE_NOT_BEEN_GENERATED",
            referenceEthci: "TODO adjust hosts",
            referenceWriteup: "Open flow.htb at 192.168.92.129",
            setupScript: "#!/bin/bash\n# TODO: generate flags"
        });

        expect(files.designMd).toContain("Reason: opencode run failed");
        expect(files.designMd).toContain("Platform baseline: Ubuntu Server 26.04.");
        expect(files.designMd).toContain("flow.ethci");
        expect(files.setupMd).toContain("Intentional draft note: install");
        expect(files.setupMd).toContain("FLAGS_ARE_GENERATED_DURING_SETUP");
        expect(files.setupMd).toContain("# Intentional draft note: generate flags");
        expect(files.writeupMd).toContain("Ubuntu Server 26.04.");
        expect(files.writeupMd).toContain("Open flow.ethci at target VM IP");
    });
});
