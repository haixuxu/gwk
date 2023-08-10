import net from 'net';
import { GankClientOpts } from './opts';

class Client {
    serverHost: string;
    serverPort: number;
    constructor(opts: GankClientOpts) {
        this.serverHost = opts.tunnelHost;
        this.serverPort = opts.tunnelAddr || 4443;
    }

    handleConection(socket: net.Socket) {
        // handleAuth
        // registerTunnel
        // response tunnel OK
        setInterval(() => {
            socket.write('okok' + Date.now());
        }, 1000);
    }

    bootstrap() {
        const targetSocket = new net.Socket();
        targetSocket.connect(this.serverPort, this.serverHost, () => {
            console.log('connect okok');
            setInterval(() => {
                targetSocket.write('hello server..');
            }, 1000);

            targetSocket.on('data', function (data) {
                console.log('recv:', data);
            });
        });
    }
}

export default Client;
