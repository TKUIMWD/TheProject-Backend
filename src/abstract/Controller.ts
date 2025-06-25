import {Request, Response} from "express";
import { Service } from "./Service";

export abstract class Controller{
    protected abstract service:Service;
    constructor(){
        
    }
}