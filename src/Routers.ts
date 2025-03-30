import {Route} from "./abstract/Route";
import { AuthRoute } from "./routers/ AuthRoute";
import { PageRoute } from "./routers/PageRoute";
import { UserRoute } from "./routers/UserRoute";

export const router: Array<Route> = [
    new PageRoute(),new UserRoute(),new AuthRoute()
];

