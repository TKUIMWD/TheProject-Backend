export type VMCloudInitCredentialSelection = {
    ciuser: string;
    cipassword: string;
    templateHasValidCiuser: boolean;
    templateHasValidCipassword: boolean;
    ciuserFromTemplate: boolean;
    cipasswordFromTemplate: boolean;
};

export function hasValidCloudInitTemplateValue(value: unknown): value is string {
    return typeof value === "string"
        && value.trim() !== ""
        && value !== "undefined"
        && value !== "null";
}

export function selectCloudInitCredentials(input: {
    requestCiuser?: unknown;
    requestCipassword?: unknown;
    templateCiuser?: unknown;
    templateCipassword?: unknown;
}): VMCloudInitCredentialSelection {
    const templateHasValidCiuser = hasValidCloudInitTemplateValue(input.templateCiuser);
    const templateHasValidCipassword = hasValidCloudInitTemplateValue(input.templateCipassword);
    const ciuserFromTemplate = input.requestCiuser === undefined && templateHasValidCiuser;
    const cipasswordFromTemplate = input.requestCipassword === undefined && templateHasValidCipassword;

    return {
        ciuser: input.requestCiuser !== undefined
            ? String(input.requestCiuser)
            : ciuserFromTemplate ? input.templateCiuser as string : "",
        cipassword: input.requestCipassword !== undefined
            ? String(input.requestCipassword)
            : cipasswordFromTemplate ? input.templateCipassword as string : "",
        templateHasValidCiuser,
        templateHasValidCipassword,
        ciuserFromTemplate,
        cipasswordFromTemplate
    };
}

export function validateCloudInitUpdateInput(input: {
    requestCiuser?: unknown;
    requestCipassword?: unknown;
}): { valid: true } | { valid: false; message: string } {
    if (input.requestCiuser === undefined && input.requestCipassword === undefined) {
        return { valid: true };
    }

    if (!(input.requestCiuser && input.requestCipassword)) {
        return { valid: false, message: "Both ciuser and cipassword must be provided and non-empty" };
    }

    const ciuserProvided = input.requestCiuser !== undefined && input.requestCiuser !== "";
    const cipasswordProvided = input.requestCipassword !== undefined && input.requestCipassword !== "";
    const ciuserEmpty = input.requestCiuser !== undefined && input.requestCiuser === "";
    const cipasswordEmpty = input.requestCipassword !== undefined && input.requestCipassword === "";

    if (!((ciuserProvided && cipasswordProvided) || (ciuserEmpty && cipasswordEmpty))) {
        return { valid: false, message: "Both ciuser and cipassword must be provided together with values, or both must be empty strings" };
    }

    return { valid: true };
}
