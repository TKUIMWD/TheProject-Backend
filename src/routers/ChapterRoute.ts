import { Route } from "../abstract/Route"
import { ChapterController } from '../controller/ChapterController'

export class ChapterRoute extends Route {

    protected url: string;
    protected Controller = new ChapterController();

    constructor() {
        super()
        this.url = '/api/v1/chapters'
        this.setRoutes()
    }

    protected setRoutes(): void {
        this.router.get(`${this.url}/:chapterId`, (req, res) => {
            this.Controller.getChapterById(req, res)
        });

        this.router.post(`${this.url}/addChapterToClass/:classId`, (req, res) => {
            this.Controller.AddChapterToClass(req, res)
        });
    }

}