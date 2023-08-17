import path from 'path';
import fs from 'fs';

export function readFile(filepath: string,isJSON?:boolean): any {
    try {
        if (path.isAbsolute(filepath) === false) {
            filepath = path.resolve(process.cwd(), filepath);
        }
        const filecontent = fs.readFileSync(filepath, 'utf8');
        if(isJSON){
            return JSON.parse(filecontent);
        }else{
            return filecontent;
        }
    } catch (err) {
        throw err;
    }
}
