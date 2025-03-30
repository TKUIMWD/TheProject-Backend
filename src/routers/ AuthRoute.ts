import { Route } from "../abstract/Route"
import { AuthController } from "../controller/AuthController";

export class AuthRoute extends Route {

    protected url: string;
    protected Contorller = new AuthController();

    constructor() {
        super()
        this.url = '/api/v1/auth/'
        this.setRoutes()
    }

    protected setRoutes(): void {

        this.router.post(`${this.url}register`, (req, res) => {
            this.Contorller.register(req, res);
        })

        this.router.get(`${this.url}verify`, (req, res) => {
            this.Contorller.verify(req, res);
        })

        this.router.post(`${this.url}login`, (req, res) => {
            this.Contorller.login(req, res);
        })

        this.router.post(`${this.url}logout`, (req, res) => {
            this.Contorller.logout(req, res);
        })
    }
}