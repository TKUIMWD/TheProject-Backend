import { Route } from "../abstract/Route"
import { GuacamoleController } from '../controller/GuacamoleController'

export class GuacamoleRoute extends Route{
    
    protected url: string;
    protected Controller = new GuacamoleController();

    constructor(){
        super()
        this.url = '/api/v1/guacamole/'
        this.setRoutes()
    }

    protected setRoutes(): void {
        // SSH connection endpoint
        this.router.post(`${this.url}ssh`, (req, res) => {
            this.Controller.establishSSHConnection(req, res);
        });

        // RDP connection endpoint
        this.router.post(`${this.url}rdp`, (req, res) => {
            this.Controller.establishRDPConnection(req, res);
        });

        // VNC connection endpoint
        this.router.post(`${this.url}vnc`, (req, res) => {
            this.Controller.establishVNCConnection(req, res);
        });

        // Guacamole disconnect endpoint
        this.router.post(`${this.url}disconnect`, (req, res) => {
            this.Controller.disconnectGuacamoleConnection(req, res);
        });

    }

}
