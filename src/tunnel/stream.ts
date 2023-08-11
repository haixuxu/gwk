const Duplex = require('stream').Duplex;

class GankStream extends Duplex {
    constructor(writerFn:any) {
        super();
        this.writerFn = writerFn;
        this.cache = Buffer.from([]);
    }

    produce(rawData?:Buffer) {
        if (!rawData) {
            console.log('no rawData====', rawData);
        }
        this.cache = Buffer.concat([this.cache, rawData]);
        this.read();
    }

    _write(chunk:Buffer, encoding:string, callback:any) {
        // The underlying source only deals with strings
        this.writerFn(chunk, this);
        callback();
    }
    _read(size?:number) {
        size = size || 1024 * 4;
        const rawdata = this.cache.subarray(0, size);
        this.push(rawdata);
        this.cache = this.cache.subarray(size);
    }
}

export default GankStream;
