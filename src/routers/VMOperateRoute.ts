import { Route } from "../abstract/Route"
import { VMOperateController } from '../controller/VMOperateController'

export class VMOperateRoute extends Route{
    
    protected url: string;
    protected Controller = new VMOperateController();

    constructor(){
        super()
        this.url = '/api/v1/vm/operate/'
        this.setRoutes()
    }

    protected setRoutes(): void {
        this.router.post(`${this.url}boot`, (req, res) => {
            this.Controller.bootVM(req, res);
        });

        this.router.post(`${this.url}shutdown`, (req, res) => {
            this.Controller.shutdownVM(req, res);
        });

        this.router.post(`${this.url}poweroff`, (req, res) => {
            this.Controller.poweroffVM(req, res);
        });

        this.router.post(`${this.url}reboot`, (req, res) => {
            this.Controller.rebootVM(req, res);
        });

        this.router.post(`${this.url}reset`, (req, res) => {
            this.Controller.resetVM(req, res);
        });
    }
}
