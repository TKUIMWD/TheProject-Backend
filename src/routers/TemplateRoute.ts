import { Route } from "../abstract/Route"
import { TemplateController } from '../controller/TemplateController'

export class TemplateRoute extends Route{
    
    protected url: string;
    protected Controller = new TemplateController();

    constructor(){
        super()
        this.url = '/api/v1/template/'
        this.setRoutes()
    }

    protected setRoutes(): void {
        this.router.get(`${this.url}getAll`, (req, res) => {
            this.Controller.getAllTemplates(req, res);
        });

        this.router.get(`${this.url}getAccessable`, (req, res) => {
            this.Controller.getAccessableTemplates(req, res);
        });
    }

}
