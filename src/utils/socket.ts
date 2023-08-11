import net from 'net';

export type ErrorCallback = (err: Error) => void;
export type CloseCallback = (code?: number) => void;
export type DataCallback = (data: Buffer) => void;

export function bindStreamSocket(stream: net.Socket, onData: DataCallback, onError: ErrorCallback, onClose: CloseCallback) {
    var buffcache = Buffer.from([]);
    stream.on('data', function(data) {
        buffcache = Buffer.concat([buffcache, data]);
        var datalen = 0;
        var pack;
        while (true) {
            if (buffcache.length <= 2) {
                return;
            }
            datalen = buffcache[0] * 256 + buffcache[1];
            if (buffcache.length < datalen + 2) {
                return;
            }
            pack = buffcache.slice(2, datalen + 2);
            buffcache = buffcache.slice(datalen + 2);
            onData(pack);
        }
    });
    stream.on('close', function(code: any) {
        onClose(code);
    });
    stream.on('error', function(err) {
        stream.destroy();
        onError(err);
    });
}


export function tcpsocketSend(socket:net.Socket, data:Buffer) {
    var datalen = data.length;
    if (socket.writable) {
        socket.write(Buffer.concat([Buffer.from([datalen >> 8, datalen % 256]), data]));
    } else {
        throw Error('socket cannot writeable!');
    }
}
