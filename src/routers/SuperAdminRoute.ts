import { Route } from "../abstract/Route";
import { SuperAdminController } from "../controller/SuperAdminController";

export class SuperAdminRoute extends Route {
    protected url: string;
    protected Controller = new SuperAdminController();

    constructor() {
        super();
        this.url = '/api/v1/superadmin/';
        this.setRoutes();
    }

    protected setRoutes(): void {
        this.router.put(`${this.url}changeUserRole`, (req, res) => {
            this.Controller.changeUserRole(req, res);
        });

        this.router.put(`${this.url}assignCRPToUser`, (req, res) => {
            this.Controller.assignCRPToUser(req, res);
        });
    }
}