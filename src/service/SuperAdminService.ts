import { Service } from "../abstract/Service";
import { User } from "../interfaces/User";
import { logger } from "../middlewares/log";
import { superAdminRequestAdapterService } from "../modules/super-admin/SuperAdminRequestAdapterService";
import { createResponse, resp } from "../utils/resp";

export type SuperAdminServiceInput = {
    actor: User;
    body: unknown;
};

type SuperAdminRequestAdapterPort = {
    changeUserRole(input: SuperAdminServiceInput): Promise<resp<undefined>>;
    assignCRPToUser(input: SuperAdminServiceInput): Promise<resp<any | undefined>>;
    getAllUsers(actor: User): Promise<resp<User[] | undefined>>;
    getAllAdminUsers(actor: User): Promise<resp<User[] | undefined>>;
};

export class SuperAdminService extends Service {
    constructor(private readonly requestAdapter: SuperAdminRequestAdapterPort = superAdminRequestAdapterService) {
        super();
    }

    public async changeUserRole(input: SuperAdminServiceInput): Promise<resp<undefined>> {
        return this.withAction("Error changing user role", () =>
            this.requestAdapter.changeUserRole(input)
        );
    }

    public async assignCRPToUser(input: SuperAdminServiceInput): Promise<resp<any | undefined>> {
        return this.withAction("Error assigning CRP to user", () =>
            this.requestAdapter.assignCRPToUser(input)
        );
    }

    public async getAllUsers(actor: User): Promise<resp<User[] | undefined>> {
        return this.withAction("Error getting all users", () =>
            this.requestAdapter.getAllUsers(actor),
            "Internal server error"
        );
    }

    public async getAllAdminUsers(actor: User): Promise<resp<User[] | undefined>> {
        return this.withAction("Error getting all admin users", () =>
            this.requestAdapter.getAllAdminUsers(actor),
            "Internal server error"
        );
    }

    private async withAction<T>(
        errorLogPrefix: string,
        action: () => Promise<resp<T | undefined>>,
        internalErrorMessage = "Internal Server Error"
    ): Promise<resp<T | undefined>> {
        try {
            return action();
        } catch (error: any) {
            logger.error(`${errorLogPrefix}: ${error.message ?? error}`);
            return createResponse(500, error.message ? `${internalErrorMessage}: ${error.message}` : internalErrorMessage);
        }
    }
}
