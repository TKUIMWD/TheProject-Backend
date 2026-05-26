import { Service } from "../abstract/Service";
import { Request } from "express";
import { logger } from "../middlewares/log";
import { createResponse, resp } from "../utils/resp";
import { validateTokenAndGetUser, validateTokenAndGetSuperAdminUser } from "../utils/auth";
import { User } from "../interfaces/User";
import { GuacamoleConnection } from "../interfaces/Guacamole";
import { guacamoleRequestAdapterService } from "../modules/guacamole/GuacamoleRequestAdapterService";

type GuacamoleUserValidation = { user: User; isSuperAdmin: boolean } | { error: resp<undefined> };

export class GuacamoleService extends Service {
    /**
     * 驗證用戶權限
     */
    private async _validateUserPermissions(req: Request): Promise<GuacamoleUserValidation> {
        try {
            // 優先嘗試 SuperAdmin 驗證
            const { user: superUser, error: superError } = await validateTokenAndGetSuperAdminUser<User>(req);
            if (!superError && superUser && superUser._id) {
                return { user: superUser, isSuperAdmin: true };
            }

            // 嘗試一般用戶驗證
            const { user, error: userError } = await validateTokenAndGetUser<User>(req);
            if (!userError && user && user._id) {
                return { user, isSuperAdmin: false };
            }

            logger.error("Authentication failed for GuacamoleService:", userError || superError);
            return { error: createResponse(401, "Authentication failed") };

        } catch (error) {
            logger.error("Error validating user permissions:", error);
            return { error: createResponse(500, "Internal Server Error") };
        }
    }

    /**
     * 建立 SSH 連線
     */
    public async establishSSHConnection(req: Request): Promise<resp<GuacamoleConnection | undefined>> {
        return this.withGuacamoleUser(req, "establishing SSH connection", (userValidation) =>
            guacamoleRequestAdapterService.establishSSHConnection({
                user: userValidation.user,
                isSuperAdmin: userValidation.isSuperAdmin,
                body: req.body
            })
        );
    }

    /**
     * 建立 RDP 連線
     */
    public async establishRDPConnection(req: Request): Promise<resp<GuacamoleConnection | undefined>> {
        return this.withGuacamoleUser(req, "establishing RDP connection", (userValidation) =>
            guacamoleRequestAdapterService.establishRDPConnection({
                user: userValidation.user,
                isSuperAdmin: userValidation.isSuperAdmin,
                body: req.body
            })
        );
    }

    /**
     * 建立 VNC 連線
     */
    public async establishVNCConnection(req: Request): Promise<resp<GuacamoleConnection | undefined>> {
        return this.withGuacamoleUser(req, "establishing VNC connection", (userValidation) =>
            guacamoleRequestAdapterService.establishVNCConnection({
                user: userValidation.user,
                isSuperAdmin: userValidation.isSuperAdmin,
                body: req.body
            })
        );
    }

    /**
     * 斷開 Guacamole 連線
     */
    public async disconnectGuacamoleConnection(req: Request): Promise<resp<{ message: string } | undefined>> {
        return this.withGuacamoleUser(
            req,
            "disconnecting Guacamole connection",
            (userValidation) => guacamoleRequestAdapterService.disconnectGuacamoleConnection({
                user: userValidation.user,
                isSuperAdmin: userValidation.isSuperAdmin,
                body: req.body
            }),
            (error) => `Error disconnecting connection: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
    }

    /**
     * 列出用戶的連接
     */
    public async listUserConnections(req: Request): Promise<resp<any[] | undefined>> {
        return this.withGuacamoleUser(req, "listing user connections", (userValidation) =>
            guacamoleRequestAdapterService.listUserConnections({ user: userValidation.user })
        );
    }

    /**
     * 刪除 Guacamole 連接
     */
    public async deleteConnection(req: Request): Promise<resp<any>> {
        return this.withGuacamoleUser(req, "deleting connection", (userValidation) =>
            guacamoleRequestAdapterService.deleteConnection({
                user: userValidation.user,
                isSuperAdmin: userValidation.isSuperAdmin,
                body: req.body
            })
        );
    }

    private async withGuacamoleUser<T>(
        req: Request,
        logContext: string,
        action: (userValidation: { user: User; isSuperAdmin: boolean }) => Promise<resp<T | undefined>>,
        failureMessage: (error: unknown) => string = () => "Internal Server Error"
    ): Promise<resp<T | undefined>> {
        try {
            const userValidation = await this._validateUserPermissions(req);
            if ('error' in userValidation) {
                return userValidation.error;
            }

            return action(userValidation);
        } catch (error) {
            logger.error(`Error ${logContext}:`, error);
            return createResponse(500, failureMessage(error));
        }
    }
}
