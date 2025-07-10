import { Route } from "../abstract/Route"
import { CourseController } from '../controller/CourseController'

export class CourseRoute extends Route{
    
    protected url: string;
    protected Controller = new CourseController();

    constructor(){
        super()
        this.url = '/api/v1/course'
        this.setRoutes()
    }

    protected setRoutes(): void {
        this.router.get(`${this.url}/getClassById`, (req, res) => {
            this.Controller.getClassById(req, res)
        });

        this.router.get(`${this.url}/getCoursePageDTO`, (req, res) => {
            this.Controller.getCoursePageDTO(req, res)
        });
    }

}