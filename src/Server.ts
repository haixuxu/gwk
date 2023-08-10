import net from 'net';
import { GankServerOpts } from './opts';

class Server {
    private listenPort: number;
    constructor(opts: GankServerOpts) {
        this.listenPort = opts.tunnelAddr || 4443;
    }

    handleConection(socket: net.Socket) {
        // handleAuth
        // registerTunnel
        // response tunnel OK
        setInterval(() => {
            socket.write('okok' + Date.now());
        }, 1000);

        socket.on('data', function (data) {
            console.log('recv:', data);
        });
    }

    bootstrap() {
        const server = net.createServer(this.handleConection);
        server.listen(this.listenPort, () => {
            console.log('server listen on 127.0.0.1:' + this.listenPort);
        });
    }
}

export default Server;
