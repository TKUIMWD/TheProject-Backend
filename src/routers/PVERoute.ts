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
        this.router.post(`${this.url}test`, (req, res) => {
            this.Controller.test(req, res);
        });
        this.router.get(`${this.url}getNodes`, (req, res) => {
            this.Controller.getNodes(req, res);
        });

        this.router.get(`${this.url}getNextId`, (req, res) => {
            this.Controller.getNextId(req, res);
        });

        this.router.post(`${this.url}getQemuConfig`, (req, res) => {
            this.Controller.getQemuConfig(req, res);
        });

        this.router.get(`${this.url}getAllTemplates`, (req, res) => {
            this.Controller.getAllTemplates(req, res);
        });
    }

}