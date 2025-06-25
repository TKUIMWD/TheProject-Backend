import { Route } from "../abstract/Route"
import { UserController } from "../controller/UserController";
import { logger } from "../middlewares/log";

export class UserRoute extends Route{
    
    protected url: string;
    protected Controller = new UserController();

    constructor(){
        super()
        this.url = '/api/v1/user/'
        this.setRoutes()
    }

    protected setRoutes(): void {
        this.router.get(`${this.url}getProfile`,(req,res)=>{
            this.Controller.getProfile(req,res);
        });
        this.router.put(`${this.url}updateProfile`,(req,res)=>{
            this.Controller.updateProfile(req,res);
        });
        this.router.put(`${this.url}changePassword`, (req, res) => {
            this.Controller.changePassword(req, res);
        });
    }
}