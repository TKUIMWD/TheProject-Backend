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
    }

}