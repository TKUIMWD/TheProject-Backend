import { Route } from "../abstract/Route";
import { AIBoxBuildController } from "../controller/AIBoxBuildController";

export class AIBoxBuildRoute extends Route {
    protected url: string;
    protected Controller = new AIBoxBuildController();

    constructor() {
        super();
        this.url = '/api/v1/ai-box-build';
        this.setRoutes();
    }

    protected setRoutes(): void {
        this.router.post(`${this.url}/jobs`, (req, res) => {
            this.Controller.createJob(req, res);
        });

        this.router.get(`${this.url}/jobs`, (req, res) => {
            this.Controller.listJobs(req, res);
        });

        this.router.get(`${this.url}/jobs/:job_id`, (req, res) => {
            this.Controller.getJob(req, res);
        });

        this.router.delete(`${this.url}/jobs/:job_id`, (req, res) => {
            this.Controller.deleteJob(req, res);
        });

        this.router.post(`${this.url}/jobs/:job_id/messages`, (req, res) => {
            this.Controller.addMessage(req, res);
        });

        this.router.patch(`${this.url}/jobs/:job_id/status`, (req, res) => {
            this.Controller.updateStatus(req, res);
        });

        this.router.post(`${this.url}/jobs/:job_id/run`, (req, res) => {
            this.Controller.launchBuildRun(req, res);
        });
    }
}
