import { connect, Mongoose } from 'mongoose';
import { logger } from '../middlewares/log';
import { MongoInfo } from '../interfaces/MongoInfo';
export class MongoDB {
    
    DB: Mongoose | void | undefined
    isConneted : boolean = false;

    constructor(info: MongoInfo) {

        const url = `mongodb://${info.name}:${encodeURIComponent(info.password)}@${info.host}:${info.port}/${info.dbName}`;
        const safeLocation = `${info.host}:${info.port}/${info.dbName}`;

        this.init(url).then(() => {

            logger.info(`success: connected to mongoDB @${safeLocation}`);
            this.isConneted = true;

        }).catch(() => {

            logger.error(`error: cannot connect to mongoDB @${safeLocation}`);

        })

    }

    async init(url: string) {
        this.DB = await connect(url).catch(err=>{
            logger.error(`error: cannot connect to mongoDB ${err instanceof Error ? err.message : String(err)}`);
        });
    }

    getState():boolean{
        return this.isConneted;
    }
}
