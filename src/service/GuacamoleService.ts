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
const GUACAMOLE_URL = process.env.GUACAMOLE_BASE_URL;
const GUACAMOLE_API_USERNAME = process.env.GUACAMOLE_API_USERNAME;
const GUACAMOLE_API_PASSWORD = process.env.GUACAMOLE_API_PASSWORD;
const PROJECTUSER_GUACAMOLE_PASSWORD = process.env.PROJECTUSER_GUACAMOLE_PASSWORD;

export class GuacamoleService extends Service {

    /**
     * 檢查 Guacamole 服務配置是否完整
     */
    private _checkGuacamoleConfiguration(): boolean {
        return !!(GUACAMOLE_URL && GUACAMOLE_API_USERNAME && GUACAMOLE_API_PASSWORD && PROJECTUSER_GUACAMOLE_PASSWORD);
    }

    /**
     * 生成 Guacamole 直接連接 URL 的 Base64URL 編碼連接標識符
     * @param configId 配置 ID
     * @param dataSource 數據源 (通常是 'postgresql')
     * @param token 認證令牌
     * @returns 完整的直接連接 URL
     */
    private _generateDirectConnectionUrl(configId: string, dataSource: string, token: string): string {
        // 格式：connection_id + \0 + client_identifier_type + \0 + database_type
        const connectionIdentifier = `${configId}\0c\0${dataSource}`;
        const encodedConnectionId = Buffer.from(connectionIdentifier).toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');

        const directUrl = `${GUACAMOLE_URL}/#/client/${encodedConnectionId}?token=${token}`;
        
        // Debug logging
        console.log(`Connection Debug - Connection Identifier: "${connectionIdentifier}"`);
        console.log(`Connection Debug - Encoded Connection ID: ${encodedConnectionId}`);
        console.log(`Direct Session URL: ${directUrl}`);
        
        return directUrl;
    }

    /**
     * 驗證用戶權限
     */
    private async _validateUserPermissions(req: Request): Promise<{ user: User; isSuperAdmin: boolean } | { error: resp<undefined> }> {
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
     * 獲取和驗證 VM 的網路信息
     */
    private async _getVMNetworkInfo(vm: any, requestedIP?: string): Promise<{ ip?: string, allIPs?: string[], message?: string }> {
        try {
            // 使用 VMUtils 獲取 VM 網路接口信息
            const networkInfo = await VMUtils.getVMNetworkInfo(vm.pve_node, vm.pve_vmid);
            
            if (!networkInfo.success) {
                return { message: networkInfo.errorMessage || "Unable to get VM network information" };
            }

            if (!networkInfo.interfaces || networkInfo.interfaces.length === 0) {
                return { message: "No network interfaces found. QEMU Guest Agent may not be running." };
            }

            // 參考 VMService 的做法來處理網路介面
            const allIPAddresses = this._extractIPAddressesFromInterfaces(networkInfo.interfaces);
            
            if (allIPAddresses.length === 0) {
                return { message: "No valid IP addresses found for VM" };
            }

            let targetIP: string;

            // 如果前端提供了 IP 地址，驗證它是否在 VM 的有效 IP 列表中
            if (requestedIP) {
                if (allIPAddresses.includes(requestedIP)) {
                    targetIP = requestedIP;
                    logger.info(`Using requested IP ${requestedIP} for VM ${vm.pve_vmid}`);
                } else {
                    logger.warn(`Requested IP ${requestedIP} is not valid for VM ${vm.pve_vmid}. Available IPs: ${allIPAddresses.join(', ')}`);
                    return { 
                        message: `Requested IP ${requestedIP} is not available for this VM. Available IPs: ${allIPAddresses.join(', ')}`,
                        allIPs: allIPAddresses
                    };
                }
            } else {
                // 如果前端沒有提供 IP，使用自動選擇邏輯
                targetIP = allIPAddresses[0]; // 預設使用第一個

                // 優先選擇私有網段 IP (10.x.x.x, 172.16-31.x.x, 192.168.x.x)
                const privateIP = allIPAddresses.find(ip => {
                    return ip.startsWith('10.') || 
                           ip.startsWith('192.168.') || 
                           (ip.startsWith('172.') && 
                            parseInt(ip.split('.')[1]) >= 16 && 
                            parseInt(ip.split('.')[1]) <= 31);
                });

                if (privateIP) {
                    targetIP = privateIP;
                }

                logger.info(`Auto-selected IP ${targetIP} for VM ${vm.pve_vmid} (from ${allIPAddresses.length} available IPs)`);
            }

            logger.info(`VM ${vm.pve_vmid} network info - Target IP: ${targetIP}, All IPs: ${allIPAddresses.join(', ')}, Interfaces count: ${networkInfo.interfaces.length}`);
            
            return { 
                ip: targetIP, 
                allIPs: allIPAddresses 
            };

        } catch (error) {
            logger.error("Error getting VM network info:", error);
            return { message: "Error getting VM network information" };
        }
    }

    /**
     * 從網路介面資料中提取 IP 地址 (參考 VMService 的實作)
     */
    private _extractIPAddressesFromInterfaces(interfacesData: any): string[] {
        let interfaces: any[];
        
        // 處理不同的數據格式
        if (Array.isArray(interfacesData)) {
            interfaces = interfacesData;
        } else if (interfacesData && 'result' in interfacesData && Array.isArray(interfacesData.result)) {
            interfaces = interfacesData.result;
        } else {
            return [];
        }

        if (!interfaces || !Array.isArray(interfaces)) {
            return [];
        }

        const allIPs: string[] = [];

        interfaces.forEach((iface: any) => {
            // 跳過回環介面
            if (iface.name === 'lo') {
                return;
            }

            // 提取 IPv4 地址
            if (iface['ip-addresses'] && Array.isArray(iface['ip-addresses'])) {
                iface['ip-addresses'].forEach((ip: any) => {
                    if (ip['ip-address'] && ip['ip-address-type'] === 'ipv4') {
                        // 排除回環地址
                        if (!ip['ip-address'].startsWith('127.')) {
                            allIPs.push(ip['ip-address']);
                        }
                    }
                });
            }
        });

        return allIPs;
    }

    /**
     * 檢查目標服務的連通性
     */
    private async _checkServiceConnectivity(hostname: string, port: number, serviceName: string): Promise<{ connected: boolean, message?: string }> {
        return new Promise((resolve) => {
            const net = require('net');
            const socket = new net.Socket();
            
            const timeout = setTimeout(() => {
                socket.destroy();
                resolve({ 
                    connected: false, 
                    message: `${serviceName} service connection timeout (${hostname}:${port})` 
                });
            }, 5000); // 5秒超時
            
            socket.connect(port, hostname, () => {
                clearTimeout(timeout);
                socket.destroy();
                resolve({ connected: true });
            });
            
            socket.on('error', (error: any) => {
                clearTimeout(timeout);
                resolve({ 
                    connected: false, 
                    message: `${serviceName} service not available at ${hostname}:${port} - ${error.message}` 
                });
            });
        });
    }

    /**
     * 專門用於 Guacamole API 的 HTTP 請求函數，支持 form-urlencoded 和 SSL 忽略
     */
    private async _guacamoleApiCall(url: string, params: Record<string, string>): Promise<any> {
        const https = require('https');
        const { URL } = require('url');
        
        return new Promise((resolve, reject) => {
            const parsedUrl = new URL(url);
            
            // 準備 form-urlencoded 數據
            const postData = new URLSearchParams(params).toString();
            
            const options = {
                hostname: parsedUrl.hostname,
                port: parsedUrl.port,
                path: parsedUrl.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': Buffer.byteLength(postData)
                },
                // 忽略 SSL 憑證驗證
                rejectUnauthorized: false
            };
            
            logger.info(`Making HTTPS request to: ${url}`);
            logger.info(`Request options:`, {
                hostname: options.hostname,
                port: options.port,
                path: options.path,
                method: options.method,
                headers: options.headers
            });
            
            const req = https.request(options, (res: any) => {
                let data = '';
                
                logger.info(`Response status: ${res.statusCode} ${res.statusMessage}`);
                logger.info(`Response headers:`, res.headers);
                
                res.on('data', (chunk: any) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    logger.info(`Response body: ${data}`);
                    try {
                        const jsonData = JSON.parse(data);
                        resolve(jsonData);
                    } catch (parseError) {
                        logger.error('Error parsing JSON response:', parseError);
                        resolve({ error: 'Invalid JSON response', rawData: data });
                    }
                });
            });
            
            req.on('error', (error: any) => {
                logger.error('HTTPS request error:', {
                    message: error.message,
                    code: error.code,
                    errno: error.errno,
                    syscall: error.syscall,
                    address: error.address,
                    port: error.port
                });
                reject(error);
            });
            
            req.write(postData);
            req.end();
        });
    }

    /**
     * 檢查 Guacamole 用戶是否存在
     */
    private async _checkGuacamoleUserExists(userEmail: string, dataSource: string): Promise<{ exists: boolean; user?: any }> {
        try {
            // 先獲取管理員認證令牌
            const authTokenResult = await this._getAdminAuthToken();
            if (authTokenResult.code !== 200 || !authTokenResult.body) {
                throw new Error("Failed to get admin auth token");
            }

            const usersUrl = `${GUACAMOLE_URL}/api/session/data/${dataSource}/users/${userEmail}`;
            
            const https = require('https');
            const { URL } = require('url');
            
            return new Promise((resolve) => {
                const parsedUrl = new URL(usersUrl);
                
                const options = {
                    hostname: parsedUrl.hostname,
                    port: parsedUrl.port,
                    path: parsedUrl.pathname,
                    method: 'GET',
                    headers: {
                        'Guacamole-Token': authTokenResult.body!.token,
                        'Content-Type': 'application/json'
                    },
                    rejectUnauthorized: false
                };

                const req = https.request(options, (res: any) => {
                    let data = '';
                    
                    res.on('data', (chunk: any) => {
                        data += chunk;
                    });
                    
                    res.on('end', () => {
                        if (res.statusCode === 200) {
                            try {
                                const userData = JSON.parse(data);
                                resolve({ exists: true, user: userData });
                            } catch (parseError) {
                                logger.error('Error parsing user data:', parseError);
                                resolve({ exists: false });
                            }
                        } else if (res.statusCode === 404) {
                            resolve({ exists: false });
                        } else {
                            logger.error(`Unexpected response status: ${res.statusCode}, data: ${data}`);
                            resolve({ exists: false });
                        }
                    });
                });

                req.on('error', (error: any) => {
                    logger.error('Error checking user existence:', error);
                    resolve({ exists: false });
                });

                req.end();
            });

        } catch (error) {
            logger.error("Error checking Guacamole user existence:", error);
            return { exists: false };
        }
    }

    /**
     * 創建 Guacamole 用戶
     */
    private async _createGuacamoleUser(userEmail: string, dataSource: string): Promise<{ success: boolean; message: string }> {
        try {
            // 獲取管理員認證令牌
            const authTokenResult = await this._getAdminAuthToken();
            if (authTokenResult.code !== 200 || !authTokenResult.body) {
                throw new Error("Failed to get admin auth token");
            }

            const createUserUrl = `${GUACAMOLE_URL}/api/session/data/${dataSource}/users`;

            const userData = {
                username: userEmail,
                password: PROJECTUSER_GUACAMOLE_PASSWORD,
                attributes: {
                    "guac-full-name": userEmail,
                    "guac-email-address": userEmail
                }
            };

            const https = require('https');
            const { URL } = require('url');
            
            return new Promise((resolve) => {
                const parsedUrl = new URL(createUserUrl);
                const postData = JSON.stringify(userData);
                
                const options = {
                    hostname: parsedUrl.hostname,
                    port: parsedUrl.port,
                    path: parsedUrl.pathname,
                    method: 'POST',
                    headers: {
                        'Guacamole-Token': authTokenResult.body!.token,
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(postData)
                    },
                    rejectUnauthorized: false
                };

                const req = https.request(options, (res: any) => {
                    let data = '';
                    
                    res.on('data', (chunk: any) => {
                        data += chunk;
                    });
                    
                    res.on('end', async () => {
                        if (res.statusCode === 200 || res.statusCode === 201) {
                            logger.info(`Successfully created Guacamole user: ${userEmail}`);
                            
                            // 設定用戶權限：只允許建立連接
                            const permissionResult = await this._setUserPermissions(userEmail, authTokenResult.body!.token, dataSource);
                            
                            if (permissionResult.success) {
                                // 驗證權限是否設定成功
                                setTimeout(async () => {
                                    const verifyResult = await this._verifyUserPermissions(userEmail, dataSource);
                                    logger.info(`Permission verification for ${userEmail}: ${verifyResult.hasPermissions ? 'SUCCESS' : 'FAILED'} - ${verifyResult.message}`);
                                }, 500);
                                
                                resolve({ success: true, message: "User created and permissions set successfully" });
                            } else {
                                logger.error(`User created but failed to set permissions: ${permissionResult.message}`);
                                resolve({ success: true, message: `User created but permission setup failed: ${permissionResult.message}` });
                            }
                        } else {
                            logger.error(`Failed to create Guacamole user. Status: ${res.statusCode}, Response: ${data}`);
                            resolve({ success: false, message: `Failed to create user: ${res.statusCode}` });
                        }
                    });
                });

                req.on('error', (error: any) => {
                    logger.error("Error creating Guacamole user:", error);
                    resolve({ success: false, message: error.message || "Unknown error" });
                });

                req.write(postData);
                req.end();
            });

        } catch (error) {
            logger.error("Error creating Guacamole user:", error);
            return { success: false, message: error instanceof Error ? error.message : "Unknown error" };
        }
    }

    /**
     * 設定用戶權限：只允許建立連接
     */
    private async _setUserPermissions(userEmail: string, adminToken: string, dataSource: string): Promise<{ success: boolean; message: string }> {
        return new Promise((resolve) => {
            try {
                const permissionsUrl = `${GUACAMOLE_URL}/api/session/data/${dataSource}/users/${userEmail}/permissions`;
                
                // 根據 Guacamole API 文檔，正確的 patch 路徑格式
                const patchOperations = [
                    {
                        "op": "add",
                        "path": "/systemPermissions",
                        "value": "CREATE_CONNECTION"
                    }
                ];

                const https = require('https');
                const { URL } = require('url');
                const postData = JSON.stringify(patchOperations);
                
                const parsedUrl = new URL(permissionsUrl);
                
                const options = {
                    hostname: parsedUrl.hostname,
                    port: parsedUrl.port,
                    path: parsedUrl.pathname,
                    method: 'PATCH',
                    headers: {
                        'Guacamole-Token': adminToken,
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(postData)
                    },
                    rejectUnauthorized: false
                };

                logger.info(`Setting CREATE_CONNECTION permission for user: ${userEmail}`);

                const req = https.request(options, (res: any) => {
                    let data = '';
                    res.on('data', (chunk: any) => {
                        data += chunk;
                    });
                    res.on('end', () => {
                        logger.info(`Permission setting response status: ${res.statusCode}`);
                        logger.info(`Permission setting response: ${data}`);
                        
                        if (res.statusCode === 200 || res.statusCode === 204) {
                            resolve({ success: true, message: "Permissions set successfully" });
                        } else {
                            resolve({ success: false, message: `Failed to set permissions: ${res.statusCode} - ${data}` });
                        }
                    });
                });

                req.on('error', (error: any) => {
                    logger.error("Error setting user permissions:", error);
                    resolve({ success: false, message: error.message || "Unknown error" });
                });

                req.write(postData);
                req.end();

            } catch (error) {
                logger.error("Error setting user permissions:", error);
                resolve({ success: false, message: error instanceof Error ? error.message : "Unknown error" });
            }
        });
    }

    /**
     * 驗證用戶是否有創建連接的權限
     */
    private async _verifyUserPermissions(userEmail: string, dataSource: string): Promise<{ hasPermissions: boolean; message?: string }> {
        try {
            // 獲取管理員認證令牌
            const authTokenResult = await this._getAdminAuthToken();
            if (authTokenResult.code !== 200 || !authTokenResult.body) {
                return { hasPermissions: false, message: "Failed to get admin auth token" };
            }

            const permissionsUrl = `${GUACAMOLE_URL}/api/session/data/${dataSource}/users/${userEmail}/permissions`;
            
            const https = require('https');
            const { URL } = require('url');
            
            return new Promise((resolve) => {
                const parsedUrl = new URL(permissionsUrl);
                
                const options = {
                    hostname: parsedUrl.hostname,
                    port: parsedUrl.port,
                    path: parsedUrl.pathname,
                    method: 'GET',
                    headers: {
                        'Guacamole-Token': authTokenResult.body!.token,
                        'Content-Type': 'application/json'
                    },
                    rejectUnauthorized: false
                };

                const req = https.request(options, (res: any) => {
                    let data = '';
                    
                    res.on('data', (chunk: any) => {
                        data += chunk;
                    });
                    
                    res.on('end', () => {
                        if (res.statusCode === 200) {
                            try {
                                const permissions = JSON.parse(data);
                                const hasCreatePermission = permissions.systemPermissions && 
                                    permissions.systemPermissions.includes('CREATE_CONNECTION');
                                
                                resolve({ 
                                    hasPermissions: hasCreatePermission,
                                    message: hasCreatePermission ? "User has connection creation permissions" : "User missing CREATE_CONNECTION permission"
                                });
                            } catch (parseError) {
                                logger.error('Error parsing permissions data:', parseError);
                                resolve({ hasPermissions: false, message: "Error parsing permissions" });
                            }
                        } else {
                            logger.error(`Failed to get user permissions. Status: ${res.statusCode}, Response: ${data}`);
                            resolve({ hasPermissions: false, message: `Failed to get permissions: ${res.statusCode}` });
                        }
                    });
                });

                req.on('error', (error: any) => {
                    logger.error('Error checking user permissions:', error);
                    resolve({ hasPermissions: false, message: "Error checking permissions" });
                });

                req.end();
            });

        } catch (error) {
            logger.error("Error verifying user permissions:", error);
            return { hasPermissions: false, message: error instanceof Error ? error.message : "Unknown error" };
        }
    }

    /**
     * 獲取管理員認證令牌
     */
    private async _getAdminAuthToken(): Promise<resp<GuacamoleAuthToken | undefined>> {
        try {
            const authUrl = `${GUACAMOLE_URL}/api/tokens`;
            
            const response = await this._guacamoleApiCall(authUrl, {
                username: GUACAMOLE_API_USERNAME!,
                password: GUACAMOLE_API_PASSWORD!
            });

            if (response.error) {
                return createResponse(500, `Admin authentication failed: ${response.error}`);
            }

            const token = response?.authToken || response?.token;
            const dataSource = response?.dataSource || 'postgresql';
            
            if (token) {
                return createResponse(200, "Admin auth token obtained", { 
                    token, 
                    dataSource,
                    username: GUACAMOLE_API_USERNAME
                });
            }

            return createResponse(500, "Failed to obtain admin auth token");
        } catch (error) {
            logger.error("Error getting admin auth token:", error);
            return createResponse(500, `Error getting admin auth token: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * 確保用戶存在並獲取用戶認證令牌
     */
    private async _ensureUserAndGetToken(userEmail: string): Promise<resp<GuacamoleAuthToken | undefined>> {
        try {
            // 先獲取管理員認證令牌以取得 dataSource
            const adminTokenResult = await this._getAdminAuthToken();
            if (adminTokenResult.code !== 200 || !adminTokenResult.body) {
                return createResponse(500, "Failed to get admin auth token for dataSource");
            }
            
            const dataSource = adminTokenResult.body.dataSource || 'postgresql';
            
            // 檢查用戶是否存在
            const { exists } = await this._checkGuacamoleUserExists(userEmail, dataSource);
            
            if (!exists) {
                logger.info(`Guacamole user ${userEmail} does not exist, creating...`);
                const createResult = await this._createGuacamoleUser(userEmail, dataSource);
                
                if (!createResult.success) {
                    return createResponse(500, `Failed to create Guacamole user: ${createResult.message}`);
                }
            }

            // 獲取用戶認證令牌
            const authUrl = `${GUACAMOLE_URL}/api/tokens`;
            
            const response = await this._guacamoleApiCall(authUrl, {
                username: userEmail,
                password: PROJECTUSER_GUACAMOLE_PASSWORD!
            });

            if (response.error) {
                return createResponse(500, `User authentication failed: ${response.error}`);
            }

            const token = response?.authToken || response?.token;
            const responseDataSource = response?.dataSource || dataSource;
            
            if (token) {
                logger.info(`Successfully obtained auth token for user: ${userEmail}`);
                return createResponse(200, "User auth token obtained", { 
                    token, 
                    dataSource: responseDataSource,
                    username: userEmail
                });
            }

            return createResponse(500, "Failed to obtain user auth token");
        } catch (error) {
            logger.error("Error in _ensureUserAndGetToken:", error);
            return createResponse(500, `Error ensuring user and getting token: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * 獲取 Guacamole 認證令牌 (使用用戶信箱和統一密碼)
     */
    private async _getGuacamoleAuthToken(req: Request): Promise<resp<GuacamoleAuthToken | undefined>> {
        try {
            // 檢查 Guacamole 服務配置
            if (!this._checkGuacamoleConfiguration()) {
                logger.error("Guacamole configuration missing:", {
                    url: !!GUACAMOLE_URL,
                    username: !!GUACAMOLE_API_USERNAME,
                    password: !!GUACAMOLE_API_PASSWORD,
                    userPassword: !!PROJECTUSER_GUACAMOLE_PASSWORD
                });
                return createResponse(503, "Guacamole service is not configured. Please contact administrator to configure the service.");
            }

            // 驗證用戶權限並獲取用戶信息
            const userValidation = await this._validateUserPermissions(req);
            if ('error' in userValidation) {
                return userValidation.error;
            }

            const userEmail = userValidation.user.email;
            if (!userEmail) {
                return createResponse(400, "User email is required for Guacamole authentication");
            }

            logger.info(`Requesting Guacamole auth token for user: ${userEmail}`);

            // 確保用戶存在並獲取認證令牌
            return await this._ensureUserAndGetToken(userEmail);

        } catch (error) {
            logger.error("Error in _getGuacamoleAuthToken:", {
                message: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined
            });
            return createResponse(500, `Error getting Guacamole auth token: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
            const { vm_id, username, password, port = 22, ip_address } = req.body as GuacamoleConnectionRequest;

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

            // 獲取並驗證 VM 網路信息（包含前端提供的 IP 地址）
            const networkInfo = await this._getVMNetworkInfo(vm, ip_address);
            if (!networkInfo.ip) {
                return createResponse(400, networkInfo.message || "Unable to get or validate VM IP address");
            }

            // 在建立連線前先檢查 SSH 服務是否可用
            const connectivityCheck = await this._checkServiceConnectivity(networkInfo.ip, port || 22, 'SSH');
            if (!connectivityCheck.connected) {
                return createResponse(503, `Cannot establish SSH connection: ${connectivityCheck.message}. Please ensure SSH service is running on the target VM.`);
            }

            // 獲取 VM 配置以取得 VM 名稱
            const vmConfig = await VMUtils.getVMConfig(vm.pve_node, vm.pve_vmid);
            const vmName = vmConfig?.name || `VM-${vm.pve_vmid}`;

            // 獲取 Guacamole 認證令牌
            const authTokenResult = await this._getGuacamoleAuthToken(req);
            if (authTokenResult.code !== 200 || !authTokenResult.body) {
                return createResponse(500, "Failed to authenticate with Guacamole service");
            }

            // 建立 Guacamole 連線參數
            const connectionParams = {
                protocol: 'ssh',
                parameters: {
                    hostname: networkInfo.ip,
                    port: port?.toString() || '22',
                    username: username || '',
                    password: password || ''
                }
            };

            // 調用 Guacamole API 建立連線
            try {
                const dataSource = authTokenResult.body.dataSource || 'postgresql';
                const connectionName = `SSH-${vmName}-${user.email}`;
                
                // 第一步：檢查是否已存在相同名稱的配置
                const connectionsListUrl = `${GUACAMOLE_URL}/api/session/data/${dataSource}/connections`;
                
                console.log('SSH Connection Debug - Checking existing connections for:', connectionName);
                
                let existingConnections;
                try {
                    existingConnections = await callWithUnauthorized(
                        'GET',
                        connectionsListUrl,
                        undefined,
                        {
                            headers: {
                                'Content-Type': 'application/json',
                                'Guacamole-Token': authTokenResult.body.token
                            }
                        }
                    );
                } catch (listError) {
                    console.log('SSH Connection Debug - Unable to list existing connections, will create new one');
                    existingConnections = null;
                }

                let configId = null;
                
                // 檢查是否已存在相同名稱的配置
                if (existingConnections && typeof existingConnections === 'object') {
                    for (const [id, connection] of Object.entries(existingConnections)) {
                        if ((connection as any)?.name === connectionName) {
                            configId = id;
                            console.log('SSH Connection Debug - Found existing config:', configId, 'for name:', connectionName);
                            break;
                        }
                    }
                }
                
                // 如果沒有找到現有配置，則創建新的
                if (!configId) {
                    console.log('SSH Connection Debug - No existing config found, creating new one');
                    
                    const connectionConfig = {
                        name: connectionName,
                        protocol: 'ssh',
                        parameters: {
                            hostname: networkInfo.ip,
                            port: (port || 22).toString(),
                            username: username || 'root',
                            password: password || '',
                        },
                        attributes: {
                            'max-connections': '5',
                            'max-connections-per-user': '2'
                        }
                    };
                    
                    console.log('SSH Connection Debug - Creating config:', JSON.stringify(connectionConfig, null, 2));
                    
                    const configResponse = await callWithUnauthorized(
                        'POST',
                        connectionsListUrl,
                        connectionConfig,
                        {
                            headers: {
                                'Content-Type': 'application/json',
                                'Guacamole-Token': authTokenResult.body.token
                            }
                        }
                    );

                    console.log('SSH Connection Debug - Config response:', JSON.stringify(configResponse, null, 2));

                    // 檢查配置創建是否成功
                    if (configResponse && (configResponse as any).type === 'INTERNAL_ERROR') {
                        const errorMsg = (configResponse as any).message || 'Internal server error';
                        console.log('SSH Connection Debug - INTERNAL_ERROR:', errorMsg);
                        return createResponse(500, `Guacamole internal error: ${errorMsg}. Please check SSH service and credentials.`);
                    }

                    if (configResponse && (configResponse as any).type === 'NOT_FOUND') {
                        const errorMsg = (configResponse as any).message || 'Resource not found';
                        console.log('SSH Connection Debug - NOT_FOUND:', errorMsg);
                        return createResponse(500, `Guacamole configuration error: ${errorMsg}`);
                    }

                    configId = (configResponse as any)?.identifier;
                    if (!configId) {
                        console.log('SSH Connection Debug - No identifier in response:', configResponse);
                        return createResponse(500, 'Failed to create connection configuration - missing identifier');
                    }

                    console.log('SSH Connection Debug - New Config ID:', configId);
                } else {
                    console.log('SSH Connection Debug - Using existing Config ID:', configId);
                }
                
                // 生成連線資訊
                const connectionId = `ssh-${vm_id}-${Date.now()}`;
                
                // 生成直接 SSH 連線 URL
                const directSSHUrl = this._generateDirectConnectionUrl(configId, dataSource, authTokenResult.body.token);
                console.log(`SSH Direct Session URL: ${directSSHUrl}`);
                
                const connection:GuacamoleConnection = {
                    connection_id: connectionId,
                    protocol: 'ssh',
                    status: 'active',
                    created_at: new Date(),
                    expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000), // 4小時後過期
                    target_ip: networkInfo.ip,
                    available_ips: networkInfo.allIPs,
                    direct_url: directSSHUrl
                };

                logger.info(`SSH connection established for user ${user.username} to VM ${vm_id} (${vm.pve_vmid}) at ${networkInfo.ip}`);

                return createResponse(200, "SSH connection established", connection);

            } catch (guacError) {
                return createResponse(500, `Failed to establish SSH connection with Guacamole: ${guacError instanceof Error ? guacError.message : 'Unknown error'}`);
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
            const { vm_id, username, password, port = 3389, ip_address } = req.body as GuacamoleConnectionRequest;

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

            // 獲取並驗證 VM 網路信息（包含前端提供的 IP 地址）
            const networkInfo = await this._getVMNetworkInfo(vm, ip_address);
            if (!networkInfo.ip) {
                return createResponse(400, networkInfo.message || "Unable to get or validate VM IP address");
            }

            // 在建立連線前先檢查 RDP 服務是否可用
            const connectivityCheck = await this._checkServiceConnectivity(networkInfo.ip, port || 3389, 'RDP');
            if (!connectivityCheck.connected) {
                return createResponse(503, `Cannot establish RDP connection: ${connectivityCheck.message}. Please ensure RDP service is running on the target VM.`);
            }

            // 獲取 VM 配置以取得 VM 名稱
            const vmConfig = await VMUtils.getVMConfig(vm.pve_node, vm.pve_vmid);
            const vmName = vmConfig?.name || `VM-${vm.pve_vmid}`;

            // 獲取 Guacamole 認證令牌
            const authTokenResult = await this._getGuacamoleAuthToken(req);
            if (authTokenResult.code !== 200 || !authTokenResult.body) {
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
                const dataSource = authTokenResult.body.dataSource || 'postgresql';
                const connectionName = `RDP-${vmName}-${user.email}`;
                
                // 檢查是否已存在相同名稱的配置
                const connectionsListUrl = `${GUACAMOLE_URL}/api/session/data/${dataSource}/connections`;
                
                console.log('RDP Connection Debug - Checking existing connections for:', connectionName);
                
                let existingConnections;
                try {
                    existingConnections = await callWithUnauthorized(
                        'GET',
                        connectionsListUrl,
                        undefined,
                        {
                            headers: {
                                'Content-Type': 'application/json',
                                'Guacamole-Token': authTokenResult.body.token
                            }
                        }
                    );
                } catch (listError) {
                    console.log('RDP Connection Debug - Unable to list existing connections, will create new one');
                    existingConnections = null;
                }

                let configId = null;
                
                // 檢查是否已存在相同名稱的配置
                if (existingConnections && typeof existingConnections === 'object') {
                    for (const [id, connection] of Object.entries(existingConnections)) {
                        if ((connection as any)?.name === connectionName) {
                            configId = id;
                            console.log('RDP Connection Debug - Found existing config:', configId, 'for name:', connectionName);
                            break;
                        }
                    }
                }
                
                // 如果沒有找到現有配置，則創建新的
                if (!configId) {
                    console.log('RDP Connection Debug - No existing config found, creating new one');
                    
                    const connectionConfig = {
                        name: connectionName,
                        protocol: 'rdp',
                        parameters: {
                            hostname: networkInfo.ip,
                            port: (port || 3389).toString(),
                            username: username,
                            password: password,
                            'ignore-cert': 'true',
                            'security': 'any'
                        },
                        attributes: {}
                    };
                    
                    console.log('RDP Connection Debug - Creating config:', JSON.stringify(connectionConfig, null, 2));
                    
                    const configResponse = await callWithUnauthorized(
                        'POST',
                        connectionsListUrl,
                        connectionConfig,
                        {
                            headers: {
                                'Content-Type': 'application/json',
                                'Guacamole-Token': authTokenResult.body.token
                            }
                        }
                    );

                    // 檢查 Guacamole API 回應是否包含錯誤
                    if (configResponse && (configResponse as any).type === 'INTERNAL_ERROR') {
                        return createResponse(500, `Guacamole connection failed: ${(configResponse as any).message || 'Unknown error'}`);
                    }

                    if (configResponse && (configResponse as any).type === 'NOT_FOUND') {
                        return createResponse(500, `Guacamole connection failed: ${(configResponse as any).message || 'Unknown error'}`);
                    }

                    configId = (configResponse as any)?.identifier;
                    if (!configId) {
                        return createResponse(500, 'Failed to create RDP connection configuration');
                    }

                    console.log('RDP Connection Debug - New Config ID:', configId);
                } else {
                    console.log('RDP Connection Debug - Using existing Config ID:', configId);
                }

                const connectionId = `rdp-${vm_id}-${Date.now()}`;
                
                // 生成直接 RDP 連線 URL - 使用正確的 Base64URL 編碼
                const directRDPUrl = this._generateDirectConnectionUrl(configId, dataSource, authTokenResult.body.token);
                console.log(`RDP Direct Session URL: ${directRDPUrl}`);
                
                const connection:GuacamoleConnection = {
                    connection_id: connectionId,
                    protocol: 'rdp',
                    status: 'active',
                    created_at: new Date(),
                    expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000), // 4小時後過期
                    target_ip: networkInfo.ip,
                    available_ips: networkInfo.allIPs,
                    direct_url: directRDPUrl
                };

                logger.info(`RDP connection established for user ${user.username} to VM ${vm_id} (${vm.pve_vmid}) at ${networkInfo.ip}`);

                return createResponse(200, "RDP connection established", connection);

            } catch (guacError) {
                return createResponse(500, `Failed to establish RDP connection with Guacamole: ${guacError instanceof Error ? guacError.message : 'Unknown error'}`);
            }

        } catch (error) {
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
            const { vm_id, password, port = 5900, ip_address } = req.body as GuacamoleConnectionRequest;

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

            // 獲取並驗證 VM 網路信息（包含前端提供的 IP 地址）
            const networkInfo = await this._getVMNetworkInfo(vm, ip_address);
            if (!networkInfo.ip) {
                return createResponse(400, networkInfo.message || "Unable to get or validate VM IP address");
            }

            // 檢查 VNC 服務連通性
            const vncPort = port || 5900;
            const isVNCConnectable = await this._checkServiceConnectivity(networkInfo.ip, vncPort, 'VNC');
            if (!isVNCConnectable) {
                logger.warn(`VNC service not accessible on ${networkInfo.ip}:${vncPort} for VM ${vm_id}`);
                return createResponse(503, `VNC service is not available on ${networkInfo.ip}:${vncPort}. Please ensure VNC server is running on the target VM.`);
            }

            // 獲取 VM 配置以取得 VM 名稱
            const vmConfig = await VMUtils.getVMConfig(vm.pve_node, vm.pve_vmid);
            const vmName = vmConfig?.name || `VM-${vm.pve_vmid}`;

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
                const dataSource = authTokenResult.body.dataSource || 'postgresql';
                const connectionName = `VNC-${vmName}-${user.email}`;
                
                // 檢查是否已存在相同名稱的配置
                const connectionsListUrl = `${GUACAMOLE_URL}/api/session/data/${dataSource}/connections`;
                
                console.log('VNC Connection Debug - Checking existing connections for:', connectionName);
                
                let existingConnections;
                try {
                    existingConnections = await callWithUnauthorized(
                        'GET',
                        connectionsListUrl,
                        undefined,
                        {
                            headers: {
                                'Content-Type': 'application/json',
                                'Guacamole-Token': authTokenResult.body.token
                            }
                        }
                    );
                } catch (listError) {
                    console.log('VNC Connection Debug - Unable to list existing connections, will create new one');
                    existingConnections = null;
                }

                let configId = null;
                
                // 檢查是否已存在相同名稱的配置
                if (existingConnections && typeof existingConnections === 'object') {
                    for (const [id, connection] of Object.entries(existingConnections)) {
                        if ((connection as any)?.name === connectionName) {
                            configId = id;
                            console.log('VNC Connection Debug - Found existing config:', configId, 'for name:', connectionName);
                            break;
                        }
                    }
                }
                
                // 如果沒有找到現有配置，則創建新的
                if (!configId) {
                    console.log('VNC Connection Debug - No existing config found, creating new one');
                    
                    const connectionConfig = {
                        name: connectionName,
                        protocol: 'vnc',
                        parameters: {
                            hostname: networkInfo.ip,
                            port: (port || 5900).toString(),
                            password: password || '',
                            'color-depth': '32'
                        },
                        attributes: {}
                    };
                    
                    console.log('VNC Connection Debug - Creating config:', JSON.stringify(connectionConfig, null, 2));
                    
                    const configResponse = await callWithUnauthorized(
                        'POST',
                        connectionsListUrl,
                        connectionConfig,
                        {
                            headers: {
                                'Content-Type': 'application/json',
                                'Guacamole-Token': authTokenResult.body.token
                            }
                        }
                    );

                    // 檢查 Guacamole API 回應是否包含錯誤
                    if (configResponse && (configResponse as any).type === 'INTERNAL_ERROR') {
                        logger.error('VNC Connection Error - Guacamole internal error:', configResponse);
                        return createResponse(500, `Guacamole internal server error. Please check if VNC service is running on ${networkInfo.ip}:${vncPort}`);
                    }

                    if (configResponse && (configResponse as any).type === 'NOT_FOUND') {
                        logger.error('VNC Connection Error - API returned NOT_FOUND:', configResponse);
                        return createResponse(500, `Guacamole connection failed: ${(configResponse as any).message || 'Connection not found'}`);
                    }

                    configId = (configResponse as any)?.identifier;
                    if (!configId) {
                        return createResponse(500, 'Failed to create VNC connection configuration');
                    }

                    console.log('VNC Connection Debug - New Config ID:', configId);
                } else {
                    console.log('VNC Connection Debug - Using existing Config ID:', configId);
                }

                const connectionId = `vnc-${vm_id}-${Date.now()}`;
                
                // 生成直接 VNC 連線 URL - 使用正確的 Base64URL 編碼
                const directVNCUrl = this._generateDirectConnectionUrl(configId, dataSource, authTokenResult.body.token);
                console.log(`VNC Direct Session URL: ${directVNCUrl}`);
                
                const connection:GuacamoleConnection = {
                    connection_id: connectionId,
                    protocol: 'vnc',
                    status: 'active',
                    created_at: new Date(),
                    expires_at: new Date(Date.now() + 4 * 60 * 60 * 1000), // 4小時後過期
                    target_ip: networkInfo.ip,
                    available_ips: networkInfo.allIPs,
                    direct_url: directVNCUrl
                };

                logger.info(`VNC connection established for user ${user.username} to VM ${vm_id} (${vm.pve_vmid}) at ${networkInfo.ip}`);

                return createResponse(200, "VNC connection established", connection);

            } catch (guacError) {
                logger.error("Error creating Guacamole VNC connection:", guacError);
                return createResponse(500, `Failed to establish VNC connection with Guacamole: ${guacError instanceof Error ? guacError.message : 'Unknown error'}`);
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
            const { connection_id, guacamole_connection_id } = req.body as GuacamoleDisconnectRequest;

            if (!connection_id) {
                return createResponse(400, "Connection ID is required");
            }

            logger.info(`Attempting to disconnect Guacamole connection ${connection_id} for user ${user.username}`);

            // 如果有 Guacamole 連線 ID，嘗試透過 API 關閉連線
            if (guacamole_connection_id) {
                // 獲取認證令牌
                const authTokenResult = await this._getGuacamoleAuthToken(req);
                if (authTokenResult.code !== 200 || !authTokenResult.body) {
                    logger.error("Failed to get auth token for disconnect");
                    return createResponse(500, "Failed to authenticate with Guacamole service for disconnect");
                }

                try {
                    // 使用 PATCH 方法透過 Guacamole API 終止活動連線 (Kill Connection)
                    const patchData = { operations: [{ op: 'remove', path: '/' }] };
                    await callWithUnauthorized(
                        'PATCH',
                        `${GUACAMOLE_URL}/api/session/data/default/activeConnections/${guacamole_connection_id}`,
                        patchData,
                        {
                            headers: {
                                'Content-Type': 'application/json-patch+json',
                                'Guacamole-Token': authTokenResult.body.token
                            }
                        }
                    );
                    logger.info(`Successfully killed Guacamole active connection ${guacamole_connection_id} via API`);

                } catch (apiError) {
                    logger.error(`Failed to kill Guacamole connection via API: ${apiError instanceof Error ? apiError.message : 'Unknown error'}`);
                    return createResponse(500, "Failed to disconnect connection via Guacamole API");
                }
            }

            return createResponse(200, "Connection disconnected successfully", { 
                message: "Connection closed successfully",
                connection_id: connection_id,
                disconnected_at: new Date().toISOString()
            });

        } catch (error) {
            logger.error("Error disconnecting Guacamole connection:", error);
            return createResponse(500, `Error disconnecting connection: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * 列出用戶的連接
     */
    public async listUserConnections(req: Request): Promise<resp<any[] | undefined>> {
        try {
            // 檢查 Guacamole 服務配置
            if (!this._checkGuacamoleConfiguration()) {
                logger.error("Guacamole service is not configured for listing connections");
                return createResponse(503, "Guacamole service is not configured. Please contact administrator to configure the service.");
            }

            // 驗證用戶權限
            const userValidation = await this._validateUserPermissions(req);
            if ('error' in userValidation) {
                return userValidation.error;
            }

            const { user } = userValidation;

            // 獲取 Guacamole 認證令牌
            const authTokenResult = await this._getGuacamoleAuthToken(req);
            if (authTokenResult.code !== 200 || !authTokenResult.body) {
                return createResponse(500, "Failed to authenticate with Guacamole service");
            }

            const dataSource = authTokenResult.body.dataSource || 'postgresql';
            
            try {
                // 調用 Guacamole API 列出連接
                const connectionsListUrl = `${GUACAMOLE_URL}/api/session/data/${dataSource}/connections`;
                
                console.log('List Connections Debug - URL:', connectionsListUrl);
                console.log('List Connections Debug - User:', user.email);
                
                const connectionsResponse = await callWithUnauthorized(
                    'GET',
                    connectionsListUrl,
                    undefined,
                    {
                        headers: {
                            'Content-Type': 'application/json',
                            'Guacamole-Token': authTokenResult.body.token
                        }
                    }
                );

                console.log('List Connections Debug - Raw response:', JSON.stringify(connectionsResponse, null, 2));

                if (!connectionsResponse || typeof connectionsResponse !== 'object') {
                    console.log('List Connections Debug - No connections found or invalid response');
                    return createResponse(200, "No connections found", []);
                }

                // 處理連接列表，過濾出屬於當前用戶的連接
                const userConnections = [];
                
                for (const [connectionId, connection] of Object.entries(connectionsResponse)) {
                    const connectionData = connection as any;
                    
                    // 檢查連接名稱是否包含用戶 email（基於我們之前的命名規則）
                    if (connectionData.name && connectionData.name.includes(user.email)) {
                        // 生成直接連接 URL
                        const directUrl = this._generateDirectConnectionUrl(
                            connectionId, 
                            dataSource, 
                            authTokenResult.body.token
                        );

                        userConnections.push({
                            connection_id: connectionId,
                            name: connectionData.name,
                            protocol: connectionData.protocol,
                            parameters: {
                                hostname: connectionData.parameters?.hostname,
                                port: connectionData.parameters?.port,
                                username: connectionData.parameters?.username
                            },
                            created_at: new Date(), // Guacamole 可能不提供創建時間
                            status: 'active' as const
                        });
                    }
                }

                console.log('List Connections Debug - Filtered user connections:', userConnections.length);

                logger.info(`Listed ${userConnections.length} connections for user ${user.email}`);
                
                return createResponse(200, `Found ${userConnections.length} connections`, userConnections);

            } catch (guacError) {
                console.log('List Connections Debug - Guacamole API error:', guacError);
                return createResponse(500, `Failed to list connections from Guacamole: ${guacError instanceof Error ? guacError.message : 'Unknown error'}`);
            }

        } catch (error) {
            logger.error("Error listing user connections:", error);
            return createResponse(500, "Internal Server Error");
        }
    }
}