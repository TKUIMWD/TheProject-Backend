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

        /**
         * @method PUT
         * @path /api/v1/superadmin/changeUserRole
         * @description Changes a specified user's role.
         * @body { userId: string, newRole: 'user' | 'admin' }
         */
        
        this.router.put(`${this.url}changeUserRole`, (req, res) => {
            this.Controller.changeUserRole(req, res);
        });

        /**
         * @method PUT
         * @path /api/v1/superadmin/assignCRPToUser
         * @description Assigns a Compute Resource Plan to a specified user.
         * @body { userId: string, CRPId: string }
         */
        
        this.router.put(`${this.url}assignCRPToUser`, (req, res) => {
            this.Controller.assignCRPToUser(req, res);
        });

        this.router.get(`${this.url}getAllUsers`, (req, res) => {
            this.Controller.getAllUsers(req, res);
        });

        this.router.get(`${this.url}getAllAdminUsers`, (req, res) => {
            this.Controller.getAllAdminUsers(req, res);
        });
    }
}