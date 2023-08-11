import {v4} from "uuid";

export function getRamdomUUID():string{
    return v4().replace(/-/g, '');
}