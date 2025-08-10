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

        // convert VM to Template
        this.router.post(`${this.url}convert`, (req, res) => {
            this.Controller.convertVMtoTemplate(req, res);
        });

        this.router.post(`${this.url}submit`, (req, res) => {
            this.Controller.submitTemplate(req, res);
        });

        /**
         * @method GET
         * @path /api/v1/template/getAllSubmittedTemplates
         * @description Gets all submitted templates (superadmin only)
         */
        this.router.get(`${this.url}getAllSubmittedTemplates`, (req, res) => {
            this.Controller.getAllSubmittedTemplates(req, res);
        });


        this.router.post(`${this.url}audit`, (req, res) => {
            this.Controller.auditSubmittedTemplate(req, res);
        });        
    }

}
