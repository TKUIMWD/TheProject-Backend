import { Route } from "../abstract/Route";
import { AIChatController } from "../controller/AIChatController";

export class AIChatRoute extends Route {
    protected url: string;
    protected Controller = new AIChatController();

    constructor() {
        super();
        this.url = '/api/v1/ai-chat';
        this.setRoutes();
    }

    protected setRoutes(): void {
        this.router.post(`${this.url}/box/hint`, (req, res) => {
            this.Controller.getBoxHint(req, res);
        });

        this.router.post(`${this.url}/box/hint-stream`, (req, res) => {
            this.Controller.getBoxHintStream(req, res);
        });
    }
}
