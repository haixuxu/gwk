import { Transform } from 'stream';

export interface HttpReq {
    method: string;
    url: string;
    version: string;
    host: string;
    headers: Record<string, string>;
}

export type TransformFn = (req: HttpReq) => HttpReq;

function parseRequest(chunk: Buffer): HttpReq {
    const headers: any = {};
    const httpRawString = chunk.toString();
    const lines = httpRawString.split('\r\n');
    const firstLine = lines[0];
    const parts = firstLine.split(' ');
    const method = parts[0];
    const url = parts[1];
    const version = parts[2];

    for (var i = 1; i < lines.length; i++) {
        let temp = lines[i];
        let keyvals = temp.split(':');
        if (keyvals.length === 2) {
            let key: string = keyvals[0].toLowerCase();
            headers[key] = keyvals[1].trim();
        }
    }

    return {
        method,
        url,
        version,
        headers,
        host: headers['host'],
    };
}

function buildRequest(req: HttpReq): Buffer {
    let ret = '';
    ret += `${req.method} ${req.url} ${req.version}\r\n`;

    Object.keys(req.headers).forEach((key) => {
        ret += `${key}: ${req.headers[key]}\r\n`;
    });
    ret += '\r\n';
    return Buffer.from(ret);
}

export class HeaderTransform extends Transform {
    transformFn: TransformFn;
    cache: Buffer;
    isHeaderCompleted: boolean;
    constructor(handler: TransformFn) {
        super();
        this.cache = Buffer.from([]);
        this.transformFn = handler;
        this.isHeaderCompleted = false;
    }
    // 将可写端写入的数据变换后添加到可读端
    _transform(chunk: Buffer, encoding: string, callback: any) {
        if (this.isHeaderCompleted) {
            this.push(chunk);
            callback();
            return;
        }
        try {
            this.cache = Buffer.concat([this.cache, chunk]);
            const headerEndIndex = this.cache.indexOf('\r\n\r\n');
            if (headerEndIndex === -1) {
                callback();
                return;
            }
            this.isHeaderCompleted = true;
            const headerChunk = chunk.slice(0, headerEndIndex + 4);
            const overflowChunk = chunk.slice(headerEndIndex + 4);

            const req = parseRequest(headerChunk);
            const req2 = this.transformFn(req);
            const header2Chunk = buildRequest(req2);
            const allbuf = Buffer.concat([header2Chunk, overflowChunk]);
            this.push(allbuf); // 推送报文头部+overflow数据
            callback();
        } catch (error) {
            callback(error);
        }
    }
}
