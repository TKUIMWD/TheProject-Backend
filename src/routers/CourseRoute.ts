import { Route } from "../abstract/Route"
import { CourseController } from '../controller/CourseController'

export class CourseRoute extends Route{
    
    protected url: string;
    protected Controller = new CourseController();

    constructor(){
        super()
        this.url = '/api/v1/courses'
        this.setRoutes()
    }

    protected setRoutes(): void {
        this.router.get(`${this.url}/:courseId`, (req, res) => {
            this.Controller.getCourseById(req, res)
        });

        this.router.get(`${this.url}/:courseId/menu`, (req, res) => {
            this.Controller.getCourseMenu(req, res)
        });
    }

}