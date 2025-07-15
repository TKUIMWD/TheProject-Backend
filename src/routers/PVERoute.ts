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
    }

}