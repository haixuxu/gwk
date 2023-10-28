import { Readable } from 'stream';
import dgram, { RemoteInfo } from 'dgram';

/**
 * wrap udp socket to readable stream
 */
class UdpOverTcpReadStream extends Readable {
    cache: Buffer;
    constructor(udpsocket: dgram.Socket, sourceaddrbuf: Buffer) {
        super();
        this.cache = Buffer.from([]);
        const self = this;
        udpsocket.on('message', function (msg: Buffer, rinfo: RemoteInfo) {
            msg = Buffer.concat([sourceaddrbuf, msg]);
            const datalen = msg.length;
            //  udp packet max length :2^16 - 1 - 8 - 20 = 65507
            const newbuf = Buffer.concat([Buffer.from([datalen >> 8, datalen % 256]), msg]);
            self.produce(newbuf);
        });
    }

    produce(rawData?: Buffer) {
        if (!rawData) {
            // console.log('no rawData====', rawData);
            return;
        }
        this.cache = Buffer.concat([this.cache, rawData]);
        this.read();
    }
    _read(size?: number) {
        size = size || 1024 * 4;
        const rawdata = this.cache.subarray(0, size);
        // console.log( 'read:',rawdata.toString())
        this.push(rawdata);
        this.cache = this.cache.subarray(size);
    }
}

export { UdpOverTcpReadStream };
