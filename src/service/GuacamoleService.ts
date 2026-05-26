import { Service } from "../abstract/Service";
import { resp } from "../utils/resp";
import { User } from "../interfaces/User";
import { GuacamoleConnection } from "../interfaces/Guacamole";
import { guacamoleRequestAdapterService } from "../modules/guacamole/GuacamoleRequestAdapterService";

export type GuacamoleServiceInput = {
    user: User;
    isSuperAdmin: boolean;
    body: any;
};

export class GuacamoleService extends Service {
    /**
     * 建立 SSH 連線
     */
    public establishSSHConnection(input: GuacamoleServiceInput): Promise<resp<GuacamoleConnection | undefined>> {
        return guacamoleRequestAdapterService.establishSSHConnection(input);
    }

    /**
     * 建立 RDP 連線
     */
    public establishRDPConnection(input: GuacamoleServiceInput): Promise<resp<GuacamoleConnection | undefined>> {
        return guacamoleRequestAdapterService.establishRDPConnection(input);
    }

    /**
     * 建立 VNC 連線
     */
    public establishVNCConnection(input: GuacamoleServiceInput): Promise<resp<GuacamoleConnection | undefined>> {
        return guacamoleRequestAdapterService.establishVNCConnection(input);
    }

    /**
     * 斷開 Guacamole 連線
     */
    public disconnectGuacamoleConnection(input: GuacamoleServiceInput): Promise<resp<{ message: string } | undefined>> {
        return guacamoleRequestAdapterService.disconnectGuacamoleConnection(input);
    }

    /**
     * 列出用戶的連接
     */
    public listUserConnections(input: GuacamoleServiceInput): Promise<resp<any[] | undefined>> {
        return guacamoleRequestAdapterService.listUserConnections(input);
    }

    /**
     * 刪除 Guacamole 連接
     */
    public deleteConnection(input: GuacamoleServiceInput): Promise<resp<any>> {
        return guacamoleRequestAdapterService.deleteConnection(input);
    }
}
