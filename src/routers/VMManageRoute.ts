import { Route } from "../abstract/Route"
import { VMManageController } from "../controller/VMManageController";

export class VMManageRoute extends Route {
    
    protected url: string;
    protected Controller = new VMManageController();

    constructor() {
        super();
        this.url = '/api/v1/vm/manage/';
        this.setRoutes();
    }

    protected setRoutes(): void {
        
        this.router.post(`${this.url}createFromTemplate`, (req, res) => {
            this.Controller.createVMFromTemplate(req, res);
        });

        this.router.delete(`${this.url}delete`, (req, res) => {
            this.Controller.deleteUserVM(req, res);
        });
    }
}