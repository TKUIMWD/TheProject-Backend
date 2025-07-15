import { Route } from "../abstract/Route"
import { VMController } from '../controller/VMController'

export class VMRoute extends Route{
    
    protected url: string;
    protected Controller = new VMController();

    constructor(){
        super()
        this.url = '/api/v1/vm/'
        this.setRoutes()
    }

    protected setRoutes(): void {
        this.router.post(`${this.url}createFromTemplate`, (req, res) => {
            this.Controller.createVMFromTemplate(req, res);
        });

        this.router.delete(`${this.url}delete`, (req, res) => {
            this.Controller.deleteUserVM(req, res);
        });

        // superadmin get all vms
        this.router.get(`${this.url}getAll`, (req, res) => {
            this.Controller.getAllVMs(req, res);
        });

        this.router.get(`${this.url}getUserOwned`, (req, res) => {
            this.Controller.getUserOwnedVMs(req, res);
        });
    }

}
