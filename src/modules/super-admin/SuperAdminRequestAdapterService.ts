import { User } from "../../interfaces/User";
import { resp } from "../../utils/resp";
import { superAdminUserManagementService } from "./SuperAdminUserManagementService";

type SuperAdminRequestAdapterServiceDeps = {
    userManagement?: {
        changeUserRole(input: {
            actor: User;
            userId: unknown;
            newRole: unknown;
        }): Promise<resp<undefined>>;
        assignCRPToUser(input: {
            actor: User;
            userId: unknown;
            planId: unknown;
        }): Promise<resp<any | undefined>>;
        listRegularUsers(actor: User): Promise<resp<User[] | undefined>>;
        listAdminUsers(actor: User): Promise<resp<User[] | undefined>>;
    };
};

export class SuperAdminRequestAdapterService {
    private readonly userManagement: NonNullable<SuperAdminRequestAdapterServiceDeps["userManagement"]>;

    constructor(deps: SuperAdminRequestAdapterServiceDeps = {}) {
        this.userManagement = deps.userManagement ?? superAdminUserManagementService;
    }

    public async changeUserRole(input: {
        actor: User;
        body: { userId?: unknown; newRole?: unknown };
    }): Promise<resp<undefined>> {
        return this.userManagement.changeUserRole({
            actor: input.actor,
            userId: input.body.userId,
            newRole: input.body.newRole
        });
    }

    public async assignCRPToUser(input: {
        actor: User;
        body: { userId?: unknown; planId?: unknown };
    }): Promise<resp<any | undefined>> {
        return this.userManagement.assignCRPToUser({
            actor: input.actor,
            userId: input.body.userId,
            planId: input.body.planId
        });
    }

    public async getAllUsers(actor: User): Promise<resp<User[] | undefined>> {
        return this.userManagement.listRegularUsers(actor);
    }

    public async getAllAdminUsers(actor: User): Promise<resp<User[] | undefined>> {
        return this.userManagement.listAdminUsers(actor);
    }
}

export const superAdminRequestAdapterService = new SuperAdminRequestAdapterService();
