import {Route} from "./abstract/Route";
import { AuthRoute } from "./routers/AuthRoute";
import { ChapterRoute } from "./routers/ChapterRoute";
import { CourseRoute } from "./routers/CourseRoute";
import { PageRoute } from "./routers/PageRoute";
import { PVERoute } from "./routers/PVERoute";
import { UserRoute } from "./routers/UserRoute";

export const router: Array<Route> = [
    new PageRoute(),new UserRoute(),new AuthRoute(),new PVERoute(),new CourseRoute(),new ChapterRoute()
];

