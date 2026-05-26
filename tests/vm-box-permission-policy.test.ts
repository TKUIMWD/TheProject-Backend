import { describe, expect, it } from "vitest";
import Roles from "../src/enum/role";
import {
    canModerateVMBox,
    canModifyBoxWriteup
} from "../src/modules/vm-box/VMBoxPermissionPolicy";

describe("VMBoxPermissionPolicy", () => {
    it("allows SuperAdmin to moderate any VM box", () => {
        expect(canModerateVMBox(Roles.SuperAdmin, "user-1", "user-2")).toBe(true);
    });

    it("allows Admin to moderate only their own VM boxes", () => {
        expect(canModerateVMBox(Roles.Admin, "user-1", "user-1")).toBe(true);
        expect(canModerateVMBox(Roles.Admin, "user-1", "user-2")).toBe(false);
    });

    it("does not allow regular users to moderate VM boxes", () => {
        expect(canModerateVMBox(Roles.User, "user-1", "user-1")).toBe(false);
    });

    it("allows only the author to modify a writeup", () => {
        expect(canModifyBoxWriteup("user-1", "user-1")).toBe(true);
        expect(canModifyBoxWriteup("user-1", "user-2")).toBe(false);
        expect(canModifyBoxWriteup(undefined, "user-2")).toBe(false);
    });
});
