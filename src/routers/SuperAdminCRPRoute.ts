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
        
        /**
         * @method POST
         * @path /api/v1/superadmin/crp/create
         * @description Creates a new Compute Resource Plan.
         */
        this.router.post(`${this.url}create`, (req, res) => {
            this.Controller.createCRP(req, res);
        });

        /**
         * @method PUT
         * @path /api/v1/superadmin/crp/update/:crpId
         * @description Updates an existing Compute Resource Plan by its ID.
         */

        this.router.put(`${this.url}update/:crpId`, (req, res) => {
            this.Controller.updateCRP(req, res);
        });

        /**
         * @method DELETE
         * @path /api/v1/superadmin/crp/delete/:crpId
         * @description Deletes a Compute Resource Plan by its ID.
         */

        this.router.delete(`${this.url}delete/:crpId`, (req, res) => {
            this.Controller.deleteCRP(req, res);
        });

        /**
         * @method GET
         * @path /api/v1/superadmin/crp/getAll
         * @description Retrieves a list of all Compute Resource Plans.
         */

        this.router.get(`${this.url}getAll`, (req, res) => {
            this.Controller.getAllCRPs(req, res);
        });
    }
}