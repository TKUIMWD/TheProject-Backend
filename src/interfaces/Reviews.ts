export interface Reviews{
    _id?:string;
    reviewer_user_id:string;
    rating_score:number;
    comment?:string;
    submitted_date:Date;
}