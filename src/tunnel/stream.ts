import { Duplex } from 'stream';

class GankStream extends Duplex {
    writerFn: any;
    cache: Buffer;
    isReady: boolean;
    id: string;
    constructor(id:string, writerFn: any) {
        super();
        this.id =id;
        this.writerFn = writerFn;
        this.cache = Buffer.from([]);
        this.isReady = false;
    }

    produce(rawData?: Buffer) {
        if (!rawData) {
            console.log('no rawData====', rawData);
            return;
        }
        this.cache = Buffer.concat([this.cache, rawData]);
        this.read();
    }

    _write(chunk: Buffer, encoding: string, callback: any) {
        // The underlying source only deals with strings
        this.writerFn(chunk, this);
        callback();
    }
    _read(size?: number) {
        size = size || 1024 * 4;
        const rawdata = this.cache.subarray(0, size);
        // console.log( 'read:',rawdata.toString())
        this.push(rawdata);
        this.cache = this.cache.subarray(size);
    }
}

export default GankStream;
