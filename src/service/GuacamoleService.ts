import { Service } from "../abstract/Service";
import { Request } from "express";
import { logger } from "../middlewares/log";
import { createResponse, resp } from "../utils/resp";
import { validateTokenAndGetUser, validateTokenAndGetSuperAdminUser } from "../utils/auth";
import { User } from "../interfaces/User";
import { VMModel } from "../orm/schemas/VM/VMSchemas";
import { VMUtils } from "../utils/VMUtils";
import { callWithUnauthorized } from "../utils/fetch";
import { 
    GuacamoleConnectionRequest, 
    GuacamoleConnection, 
    GuacamoleAuthToken, 
    GuacamoleDisconnectRequest, 
    GuacamoleDisconnectResponse 
} from "../interfaces/Guacamole";

// Guacamole 環境變數配置
const GUACAMOLE_URL = process.env.GUACAMOLE_API_BASE_URL;
const GUACAMOLE_USERNAME = process.env.GUACAMOLE_USER;
const GUACAMOLE_PASSWORD = process.env.GUACAMOLE_PASSWORD;

export class GuacamoleService extends Service {

    /**
     * 檢查 Guacamole 服務配置是否完整
     */
    private _checkGuacamoleConfiguration(): boolean {
        return !!(GUACAMOLE_URL && GUACAMOLE_USERNAME && GUACAMOLE_PASSWORD);
    }

    /**
     * 驗證用戶權限
     */
    private async _validateUserPermissions(req: Request): Promise<{ user: User; isSuperAdmin: boolean } | { error: resp<undefined> }> {
        try {
            // 優先嘗試一般用戶驗證
            const { user, error: userError } = await validateTokenAndGetUser<User>(req);
            if (!userError && user && user._id) {
                return { user, isSuperAdmin: false };
            }

            // 嘗試 SuperAdmin 驗證
            const { user: superUser, error: superError } = await validateTokenAndGetSuperAdminUser<User>(req);
            if (!superError && superUser && superUser._id) {
                return { user: superUser, isSuperAdmin: true };
            }

            logger.error("Authentication failed for GuacamoleService:", userError || superError);
            return { error: createResponse(401, "Authentication failed") };

        } catch (error) {
            logger.error("Error validating user permissions:", error);
            return { error: createResponse(500, "Internal Server Error") };
        }
    }

    /**
     * 驗證用戶是否有權限連接指定的 VM
     */
    private async _validateVMPermission(userId: string, vmId: string, isSuperAdmin: boolean = false): Promise<{ valid: boolean, vm?: any, message?: string }> {
        try {
            // 查找 VM
            const vm = await VMModel.findById(vmId).exec();
            if (!vm) {
                return { valid: false, message: "VM not found" };
            }

            // SuperAdmin 可以連接任何 VM
            if (isSuperAdmin) {
                return { valid: true, vm };
            }

            // 普通用戶只能連接自己擁有的 VM
            if (vm.owner !== userId) {
                return { valid: false, message: "You don't have permission to access this VM" };
            }

            return { valid: true, vm };
        } catch (error) {
            logger.error("Error validating VM permission:", error);
            return { valid: false, message: "Error validating VM permission" };
        }
    }

    /**
     * 檢查 VM 是否處於運行狀態
     */
    private async _checkVMStatus(vm: any): Promise<{ running: boolean, message?: string }> {
        try {
            const vmStatus = await VMUtils.getVMStatus(vm.pve_node, vm.pve_vmid);
            
            if (!vmStatus) {
                return { running: false, message: "Unable to get VM status" };
            }

            if (vmStatus.status !== 'running') {
                return { running: false, message: `VM is not running (current status: ${vmStatus.status})` };
            }

            return { running: true };
        } catch (error) {
            logger.error("Error checking VM status:", error);
            return { running: false, message: "Error checking VM status" };
        }
    }

    /**
     * 獲取 VM 的網路信息
     */
    private async _getVMNetworkInfo(vm: any): Promise<{ ip?: string, allIPs?: string[], message?: string }> {
        try {
            // 使用 VMUtils 獲取 VM 網路接口信息
            const networkInfo = await VMUtils.getVMNetworkInfo(vm.pve_node, vm.pve_vmid);
            
            if (!networkInfo.success) {
                return { message: networkInfo.errorMessage || "Unable to get VM network information" };
            }

            if (!networkInfo.interfaces || networkInfo.interfaces.length === 0) {
                return { message: "No network interfaces found. QEMU Guest Agent may not be running." };
            }

            // 提取所有 IP 地址
            const allIPAddresses = VMUtils.extractIPAddresses(networkInfo.interfaces);
            
            if (allIPAddresses.length === 0) {
                return { message: "No valid IP addresses found for VM" };
            }

            // 優先選擇 IP 地址的邏輯：
            // 1. 優先選擇私有網段 IP (10.x.x.x, 172.16-31.x.x, 192.168.x.x)
            // 2. 如果沒有私有 IP，選擇第一個公網 IP
            // 3. 最後選擇任何可用的 IP
            let primaryIP = allIPAddresses[0]; // 預設使用第一個

            // 尋找私有網段 IP
            const privateIP = allIPAddresses.find(ip => {
                return ip.startsWith('10.') || 
                       ip.startsWith('192.168.') || 
                       (ip.startsWith('172.') && 
                        parseInt(ip.split('.')[1]) >= 16 && 
                        parseInt(ip.split('.')[1]) <= 31);
            });

            if (privateIP) {
                primaryIP = privateIP;
            }

            logger.info(`VM ${vm.pve_vmid} network info - Primary IP: ${primaryIP}, All IPs: ${allIPAddresses.join(', ')}, Interfaces count: ${networkInfo.interfaces.length}`);
            
            return { 
                ip: primaryIP, 
                allIPs: allIPAddresses 
            };

        } catch (error) {
            logger.error("Error getting VM network info:", error);
            return { message: "Error getting VM network information" };
        }
    }

    /**
     * 獲取 Guacamole 認證令牌
     */
    private async _getGuacamoleAuthToken(req: Request): Promise<resp<GuacamoleAuthToken | undefined>> {
        try {
            // 檢查 Guacamole 服務配置
            if (!this._checkGuacamoleConfiguration()) {
                logger.error("Guacamole service is not configured. Missing environment variables: GUACAMOLE_URL, GUACAMOLE_USERNAME, GUACAMOLE_PASSWORD");
                return createResponse(503, "Guacamole service is not configured. Please contact administrator to configure the service.");
            }

            // 調用 Guacamole API 獲取認證令牌
            const authResponse: any = await callWithUnauthorized('POST', `${GUACAMOLE_URL}/api/tokens`, {
                username: GUACAMOLE_USERNAME,
                password: GUACAMOLE_PASSWORD
            }, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

            if (authResponse && authResponse.authToken) {
                return createResponse(200, "Guacamole auth token obtained", { token: authResponse.authToken });
            }

            return createResponse(500, "Failed to obtain Guacamole auth token");
        } catch (error) {
            logger.error("Error getting Guacamole auth token:", error);
            return createResponse(500, "Error getting Guacamole auth token");
        }
    }

    /**
     * 建立 SSH 連線
     */
    public async establishSSHConnection(req: Request): Promise<resp<GuacamoleConnection | undefined>> {
        try {
            // 檢查 Guacamole 服務配置
            if (!this._checkGuacamoleConfiguration()) {
                logger.error("Guacamole service is not configured for SSH connection");
                return createResponse(503, "Guacamole service is not configured. Please contact administrator to configure the service.");
            }

            // 驗證用戶權限
            const userValidation = await this._validateUserPermissions(req);
            if ('error' in userValidation) {
                return userValidation.error;
            }

            const { user, isSuperAdmin } = userValidation;
            const { vm_id, username, password, port = 22 } = req.body as GuacamoleConnectionRequest;

            if (!vm_id) {
                return createResponse(400, "VM ID is required");
            }

            // 驗證 VM 權限
            const vmPermission = await this._validateVMPermission(user._id!.toString(), vm_id, isSuperAdmin);
            if (!vmPermission.valid) {
                return createResponse(403, vmPermission.message || "Access denied");
            }

            const vm = vmPermission.vm;

            // 檢查 VM 狀態
            const vmStatus = await this._checkVMStatus(vm);
            if (!vmStatus.running) {
                return createResponse(400, vmStatus.message || "VM is not running");
            }

            // 獲取 VM 網路信息
            const networkInfo = await this._getVMNetworkInfo(vm);
            if (!networkInfo.ip) {
                return createResponse(500, networkInfo.message || "Unable to get VM IP address");
            }

            // 獲取 Guacamole 認證令牌
            const authTokenResult = await this._getGuacamoleAuthToken(req);
            if (authTokenResult.code !== 200 || !authTokenResult.body) {
                logger.error("Failed to get Guacamole auth token for SSH connection");
                return createResponse(500, "Failed to authenticate with Guacamole service");
            }

            // 建立 Guacamole 連線參數
            const connectionParams = {
                protocol: 'ssh',
                parameters: {
                    hostname: networkInfo.ip,
                    port: port?.toString() || '22',
                    username: username || '',
                    password: password || '',
                    'enable-sftp': 'true',
                    'sftp-root-directory': '/'
                }
            };

            // 調用 Guacamole API 建立連線
            try {
                const guacamoleConnection = await callWithUnauthorized(
                    'POST',
                    `${GUACAMOLE_URL}/api/session/data/default/connections`,
                    connectionParams,
                    {
                        headers: {
                            'Content-Type': 'application/json',
                            'Guacamole-Token': authTokenResult.body.token
                        }
                    }
                );

                const connectionId = `ssh-${vm_id}-${Date.now()}`;
                const connection: GuacamoleConnection = {
                    connection_id: connectionId,
                    vm_id: vm_id,
                    protocol: 'ssh',
                    status: 'active',
                    created_at: new Date(),
                    expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000), // 4小時後過期
                    guacamole_connection_id: (guacamoleConnection as any)?.identifier || connectionId,
                    target_ip: networkInfo.ip,
                    available_ips: networkInfo.allIPs
                };

                logger.info(`SSH connection established for user ${user.username} to VM ${vm_id} (${vm.pve_vmid}) at ${networkInfo.ip}`);

                return createResponse(200, "SSH connection established", connection);

            } catch (guacError) {
                logger.error("Error creating Guacamole SSH connection:", guacError);
                return createResponse(500, "Failed to establish SSH connection with Guacamole");
            }

        } catch (error) {
            logger.error("Error establishing SSH connection:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    /**
     * 建立 RDP 連線
     */
    public async establishRDPConnection(req: Request): Promise<resp<GuacamoleConnection | undefined>> {
        try {
            // 檢查 Guacamole 服務配置
            if (!this._checkGuacamoleConfiguration()) {
                logger.error("Guacamole service is not configured for RDP connection");
                return createResponse(503, "Guacamole service is not configured. Please contact administrator to configure the service.");
            }

            // 驗證用戶權限
            const userValidation = await this._validateUserPermissions(req);
            if ('error' in userValidation) {
                return userValidation.error;
            }

            const { user, isSuperAdmin } = userValidation;
            const { vm_id, username, password, port = 3389 } = req.body as GuacamoleConnectionRequest;

            if (!vm_id) {
                return createResponse(400, "VM ID is required");
            }

            if (!username || !password) {
                return createResponse(400, "Username and password are required for RDP connection");
            }

            // 驗證 VM 權限
            const vmPermission = await this._validateVMPermission(user._id!.toString(), vm_id, isSuperAdmin);
            if (!vmPermission.valid) {
                return createResponse(403, vmPermission.message || "Access denied");
            }

            const vm = vmPermission.vm;

            // 檢查 VM 狀態
            const vmStatus = await this._checkVMStatus(vm);
            if (!vmStatus.running) {
                return createResponse(400, vmStatus.message || "VM is not running");
            }

            // 獲取 VM 網路信息
            const networkInfo = await this._getVMNetworkInfo(vm);
            if (!networkInfo.ip) {
                return createResponse(500, networkInfo.message || "Unable to get VM IP address");
            }

            // 獲取 Guacamole 認證令牌
            const authTokenResult = await this._getGuacamoleAuthToken(req);
            if (authTokenResult.code !== 200 || !authTokenResult.body) {
                logger.error("Failed to get Guacamole auth token for RDP connection");
                return createResponse(500, "Failed to authenticate with Guacamole service");
            }

            // 建立 Guacamole RDP 連線參數
            const connectionParams = {
                protocol: 'rdp',
                parameters: {
                    hostname: networkInfo.ip,
                    port: port?.toString() || '3389',
                    username: username,
                    password: password,
                    'ignore-cert': 'true',
                    'security': 'any'
                }
            };

            // 調用 Guacamole API 建立連線
            try {
                const guacamoleConnection = await callWithUnauthorized(
                    'POST',
                    `${GUACAMOLE_URL}/api/session/data/default/connections`,
                    connectionParams,
                    {
                        headers: {
                            'Content-Type': 'application/json',
                            'Guacamole-Token': authTokenResult.body.token
                        }
                    }
                );

                const connectionId = `rdp-${vm_id}-${Date.now()}`;
                const connection: GuacamoleConnection = {
                    connection_id: connectionId,
                    vm_id: vm_id,
                    protocol: 'rdp',
                    status: 'active',
                    created_at: new Date(),
                    expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000), // 4小時後過期
                    guacamole_connection_id: (guacamoleConnection as any)?.identifier || connectionId,
                    target_ip: networkInfo.ip,
                    available_ips: networkInfo.allIPs
                };

                logger.info(`RDP connection established for user ${user.username} to VM ${vm_id} (${vm.pve_vmid}) at ${networkInfo.ip}`);

                return createResponse(200, "RDP connection established", connection);

            } catch (guacError) {
                logger.error("Error creating Guacamole RDP connection:", guacError);
                return createResponse(500, "Failed to establish RDP connection with Guacamole");
            }

        } catch (error) {
            logger.error("Error establishing RDP connection:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    /**
     * 建立 VNC 連線
     */
    public async establishVNCConnection(req: Request): Promise<resp<GuacamoleConnection | undefined>> {
        try {
            // 檢查 Guacamole 服務配置
            if (!this._checkGuacamoleConfiguration()) {
                logger.error("Guacamole service is not configured for VNC connection");
                return createResponse(503, "Guacamole service is not configured. Please contact administrator to configure the service.");
            }

            // 驗證用戶權限
            const userValidation = await this._validateUserPermissions(req);
            if ('error' in userValidation) {
                return userValidation.error;
            }

            const { user, isSuperAdmin } = userValidation;
            const { vm_id, password, port = 5900 } = req.body as GuacamoleConnectionRequest;

            if (!vm_id) {
                return createResponse(400, "VM ID is required");
            }

            // 驗證 VM 權限
            const vmPermission = await this._validateVMPermission(user._id!.toString(), vm_id, isSuperAdmin);
            if (!vmPermission.valid) {
                return createResponse(403, vmPermission.message || "Access denied");
            }

            const vm = vmPermission.vm;

            // 檢查 VM 狀態
            const vmStatus = await this._checkVMStatus(vm);
            if (!vmStatus.running) {
                return createResponse(400, vmStatus.message || "VM is not running");
            }

            // 獲取 VM 網路信息
            const networkInfo = await this._getVMNetworkInfo(vm);
            if (!networkInfo.ip) {
                return createResponse(500, networkInfo.message || "Unable to get VM IP address");
            }

            // 獲取 Guacamole 認證令牌
            const authTokenResult = await this._getGuacamoleAuthToken(req);
            if (authTokenResult.code !== 200 || !authTokenResult.body) {
                logger.error("Failed to get Guacamole auth token for VNC connection");
                return createResponse(500, "Failed to authenticate with Guacamole service");
            }

            // 建立 Guacamole VNC 連線參數
            const connectionParams = {
                protocol: 'vnc',
                parameters: {
                    hostname: networkInfo.ip,
                    port: port?.toString() || '5900',
                    password: password || '',
                    'color-depth': '32'
                }
            };

            // 調用 Guacamole API 建立連線
            try {
                const guacamoleConnection = await callWithUnauthorized(
                    'POST',
                    `${GUACAMOLE_URL}/api/session/data/default/connections`,
                    connectionParams,
                    {
                        headers: {
                            'Content-Type': 'application/json',
                            'Guacamole-Token': authTokenResult.body.token
                        }
                    }
                );

                const connectionId = `vnc-${vm_id}-${Date.now()}`;
                const connection: GuacamoleConnection = {
                    connection_id: connectionId,
                    vm_id: vm_id,
                    protocol: 'vnc',
                    status: 'active',
                    created_at: new Date(),
                    expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000), // 4小時後過期
                    guacamole_connection_id: (guacamoleConnection as any)?.identifier || connectionId,
                    target_ip: networkInfo.ip,
                    available_ips: networkInfo.allIPs
                };

                logger.info(`VNC connection established for user ${user.username} to VM ${vm_id} (${vm.pve_vmid}) at ${networkInfo.ip}`);

                return createResponse(200, "VNC connection established", connection);

            } catch (guacError) {
                logger.error("Error creating Guacamole VNC connection:", guacError);
                return createResponse(500, "Failed to establish VNC connection with Guacamole");
            }

        } catch (error) {
            logger.error("Error establishing VNC connection:", error);
            return createResponse(500, "Internal Server Error");
        }
    }

    /**
     * 斷開 Guacamole 連線
     */
    public async disconnectGuacamoleConnection(req: Request): Promise<resp<{ message: string } | undefined>> {
        try {
            // 檢查 Guacamole 服務配置
            if (!this._checkGuacamoleConfiguration()) {
                logger.error("Guacamole service is not configured for disconnect operation");
                return createResponse(503, "Guacamole service is not configured. Please contact administrator to configure the service.");
            }

            // 驗證用戶權限
            const userValidation = await this._validateUserPermissions(req);
            if ('error' in userValidation) {
                return userValidation.error;
            }

            const { user } = userValidation;
            const { connection_id } = req.body;

            if (!connection_id) {
                return createResponse(400, "Connection ID is required");
            }

            // 實際實作時需要調用 Guacamole API 來斷開連線
            // 這裡是示例實作
            logger.info(`Disconnecting Guacamole connection ${connection_id} for user ${user.username}`);

            // 可以在這裡清理連線記錄，更新資料庫狀態等

            return createResponse(200, "Connection disconnected successfully", { message: "Connection closed" });

        } catch (error) {
            logger.error("Error disconnecting Guacamole connection:", error);
            return createResponse(500, "Internal Server Error");
        }
    }
}