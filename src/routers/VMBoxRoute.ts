import { Route } from "../abstract/Route"
import { VMBoxController } from '../controller/VMBoxController'

export class VMBoxRoute extends Route{
    
    protected url: string;
    protected Controller = new VMBoxController();

    constructor(){
        super()
        this.url = '/api/v1/vmbox/'
        this.setRoutes()
    }

    protected setRoutes(): void {
        // 提交 Box
        this.router.post(`${this.url}submit`, (req, res) => {
            this.Controller.submitBox(req, res);
        });

        // 審核 Box 申請 (SuperAdmin only)
        this.router.post(`${this.url}audit`, (req, res) => {
            this.Controller.auditBoxSubmission(req, res);
        });

        // 獲取提交的申請列表 (SuperAdmin only)
        this.router.get(`${this.url}submissions`, (req, res) => {
            this.Controller.getSubmittedBoxes(req, res);
        });

        // 評分 Box
        this.router.post(`${this.url}rate`, (req, res) => {
            this.Controller.rateBox(req, res);
        });

        // 獲取所有公開的 Box
        this.router.get(`${this.url}public`, (req, res) => {
            this.Controller.getPublicBoxes(req, res);
        });

        // 獲取待審核的 Box (SuperAdmin only)
        this.router.get(`${this.url}pending`, (req, res) => {
            this.Controller.getPendingBoxes(req, res);
        });

        // 獲取 Box 的評論列表
        this.router.get(`${this.url}reviews`, (req, res) => {
            this.Controller.getBoxReviews(req, res);
        });

        this.router.get(`${this.url}getMyAnswerRecord`, (req, res) => {
            this.Controller.getMyAnswerRecord(req, res);
        });

        this.router.post(`${this.url}submitBoxAnswer`, (req, res) => {
            this.Controller.submitBoxAnswer(req, res);
        });
    }
}
