import { Route } from "../abstract/Route"
import { ClassController } from '../controller/ClassController'

export class ClassRoute extends Route {

    protected url: string;
    protected Controller = new ClassController();

    constructor() {
        super()
        this.url = '/api/v1/classes'
        this.setRoutes()
    }

    protected setRoutes(): void {
        this.router.post(`${this.url}/addClassToCourse/:courseId`, (req, res) => {
            this.Controller.AddClassToCourse(req, res)
        });
    }
}