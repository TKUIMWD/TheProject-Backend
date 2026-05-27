import { Route } from "../abstract/Route"
import { PVEController } from '../controller/PVEController'

export class PVERoute extends Route{
    
    protected url: string;
    protected Controller = new PVEController();

    constructor(){
        super()
        this.url = '/api/v1/pve/'
        this.setRoutes()
    }

    protected setRoutes(): void {
        this.router.get(`${this.url}getNodes`, (req, res) => {
            this.Controller.getNodes(req, res);
        });

        this.router.get(`${this.url}getQemuConfig`, (req, res) => {
            this.Controller.getQemuConfig(req, res);
        });

        this.router.post(`${this.url}getMultipleTasksStatus`, (req, res) => {
            this.Controller.getMultipleTasksStatus(req, res);
        });

        this.router.get(`${this.url}getUserAllTasksStatus`, (req, res) => {
            this.Controller.getUserAllTasksStatus(req, res);
        });

        // 即時重新整理任務狀態
        this.router.post(`${this.url}refreshTaskStatus`, (req, res) => {
            this.Controller.refreshTaskStatus(req, res);
        });

        // 清理舊任務記錄 (超級管理員限定)
        this.router.post(`${this.url}cleanupTasks`, (req, res) => {
            this.Controller.cleanupTasks(req, res);
        });

        // 這個路由會返回用戶最近的任務狀態，
        // 包括任務 ID 以便前端可以查詢即時狀態
        this.router.get(`${this.url}getUserLatestTaskStatus`, (req, res) => {
            this.Controller.getUserLatestTaskStatus(req, res);
        });

        // 取得 dashboard 近期任務清單，管理員限定，只讀
        this.router.get(`${this.url}getRecentTasks`, (req, res) => {
            this.Controller.getRecentTasks(req, res);
        });

        // 取得 PVE Datacenter 狀態
        // overview 包含 CPU、RAM、Storage 使用狀況
        // nodes 包含每個節點的詳細狀態 : online, CPU, RAM , uptime
        this.router.get(`${this.url}getDatacenterStatus`, (req, res) => {
            this.Controller.getDatacenterStatus(req, res);
        });

        // 取得 PVE VM 即時清單，只讀，不執行 VM 操作
        this.router.get(`${this.url}getVMInventory`, (req, res) => {
            this.Controller.getVMInventory(req, res);
        });

        // 取得 PVE storage 詳細清單，只讀，shared storage 由後端在總量中去重
        this.router.get(`${this.url}getStorageDetails`, (req, res) => {
            this.Controller.getStorageDetails(req, res);
        });

        // 取得 PVE VM 唯讀詳情，以 PVE node/vmid 查詢
        this.router.get(`${this.url}getVMDetail`, (req, res) => {
            this.Controller.getVMDetail(req, res);
        });

        // 執行 PVE QEMU VM 操作，僅限 admin/superadmin，前端仍不可接觸 PVE token
        this.router.post(`${this.url}operateVM`, (req, res) => {
            this.Controller.operateVM(req, res);
        });

        // 批次刪除 PVE QEMU VM，僅限 admin/superadmin，後端會拒絕 template 與 running VM
        this.router.post(`${this.url}deleteVMs`, (req, res) => {
            this.Controller.deleteVMs(req, res);
        });

        // 取得 dashboard rolling trend snapshots
        this.router.get(`${this.url}getDashboardTrends`, (req, res) => {
            this.Controller.getDashboardTrends(req, res);
        });
    }

}
