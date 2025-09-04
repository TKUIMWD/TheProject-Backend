import {model, Schema} from "mongoose";
import { AnswerRecords } from "../../../interfaces/AnswerRecords";

export const AnswerRecordSchemas = new Schema<AnswerRecords>({
    // 使用 Map 來存儲動態鍵值對
    // key: flag_id, value: is_correct
    // 這裡使用 Map 類型來存儲動態的鍵值對
    // 這樣可以方便地進行查詢和更新
    // 例如: { "flag1": true, "flag2": false }
}, { strict: false });

export const AnswerRecordModel = model<AnswerRecords>('answer_records', AnswerRecordSchemas);