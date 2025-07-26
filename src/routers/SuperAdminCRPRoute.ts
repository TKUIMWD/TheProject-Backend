import { Route } from "../abstract/Route";
import { SuperAdminCRPController } from "../controller/SuperAdminCRPController";

export class SuperAdminCRPRoute extends Route {
    
    protected url: string;
    protected Controller = new SuperAdminCRPController();

    constructor() {
        super();
        this.url = '/api/v1/superadmin/crp/';
        this.setRoutes();
    }

    protected setRoutes(): void {
        this.router.post(`${this.url}create`, (req, res) => {
            this.Controller.createCRP(req, res);
        });

        this.router.put(`${this.url}update/:crpId`, (req, res) => {
            this.Controller.updateCRP(req, res);
        });

        this.router.delete(`${this.url}delete/:crpId`, (req, res) => {
            this.Controller.deleteCRP(req, res);
        });

        this.router.get(`${this.url}getAll`, (req, res) => {
            this.Controller.getAllCRPs(req, res);
        });
    }
}