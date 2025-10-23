import { Controller } from "../abstract/Controller";
import { Request, Response } from "express";
import { AIChatService } from "../service/AIChatService";

export class AIChatController extends Controller {
    protected service: AIChatService;

    constructor() {
        super();
        this.service = new AIChatService();
    }

    public async getBoxHintStream(Request: Request, Response: Response) {
        Response.setHeader('Content-Type', 'text/event-stream');
        Response.setHeader('Cache-Control', 'no-cache');
        Response.setHeader('Connection', 'keep-alive');
        Response.setHeader('X-Accel-Buffering', 'no');

        Response.write('data: {"status":"connected"}\n\n');

        const stream = this.service.getBoxHintStream(Request);

        for await (const chunk of stream) {
            if (chunk.startsWith('{') && chunk.includes('error')) {
                Response.write(`data: ${chunk}\n\n`);
                Response.end();
                return;
            }

            Response.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
        }

        Response.write('data: {"status":"completed"}\n\n');
        Response.end();
    }

    public async getBoxHint(Request: Request, Response: Response) {
        const resp = await this.service.getBoxHint(Request);
        Response.status(resp.code).send(resp)
    }
}
