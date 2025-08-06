import {Route} from "./abstract/Route";
import { AuthRoute } from "./routers/AuthRoute";
import { ChapterRoute } from "./routers/ChapterRoute";
import { CourseRoute } from "./routers/CourseRoute";
import { PageRoute } from "./routers/PageRoute";
import { PVERoute } from "./routers/PVERoute";
import { UserRoute } from "./routers/UserRoute";
import { VMRoute } from "./routers/VMRoute";
import { TemplateRoute } from "./routers/TemplateRoute";
import { TemplateManageRoute } from "./routers/TemplateManageRoute";
import { VMManageRoute } from "./routers/VMManageRoute";
import { VMOperateRoute } from "./routers/VMOperateRoute";
import { SuperAdminRoute } from "./routers/SuperAdminRoute";
import { SuperAdminCRPRoute } from "./routers/SuperAdminCRPRoute";

export const router: Array<Route> = [
    new PageRoute(),new UserRoute(),new AuthRoute(),
    new PVERoute(),new CourseRoute(),new ChapterRoute(),
    new VMRoute(),new TemplateRoute(),new TemplateManageRoute(),
    new VMManageRoute(),new VMOperateRoute(),new SuperAdminRoute(),
    new SuperAdminCRPRoute()
];

