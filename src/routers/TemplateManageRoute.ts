import { Route } from "../abstract/Route";
import { TemplateManageController } from "../controller/TemplateManageController";

export class TemplateManageRoute extends Route {
    
    protected url: string;
    protected Controller = new TemplateManageController();

    constructor() {
        super();
        this.url = '/api/v1/template/manage/';
        this.setRoutes();
    }

    protected setRoutes(): void {
        // 更新模板配置
        this.router.post(`${this.url}update`, (req, res) => {
            this.Controller.updateTemplateConfig(req, res);
        });

        // 刪除模板
        this.router.delete(`${this.url}delete`, (req, res) => {
            this.Controller.deleteTemplate(req, res);
        });

        // 克隆模板到新模板
        this.router.post(`${this.url}clone`, (req, res) => {
            this.Controller.cloneTemplate(req, res);
        });
    }
}
