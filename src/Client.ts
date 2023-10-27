import net from 'net';
import dgram from 'dgram';
import { GankClientOpts, TunnelOpts } from './types/index';
import { Tunnel } from './tunnel';
import getCustomLogger, { Logger } from './utils/logger';
import chalk from 'chalk';
import printer from './utils/printer';
import { bindStreamSocket } from './utils/socket';
import { UdpOverTcpReadStream } from './stream/udp2tcp';

class Client {
    serverHost: string;
    serverPort: number;
    tunnelsMap: Record<string, TunnelOpts>;
    logger: Logger;
    constructor(opts: GankClientOpts) {
        this.serverHost = opts.serverHost;
        this.serverPort = opts.serverPort || 4443;
        this.tunnelsMap = opts.tunnels || {};
        this.logger = getCustomLogger('c>', 'debug');
    }
    handleUdpStream(tunnel: Tunnel, stream: any) {
        const tunnelConf = tunnel.opts as TunnelOpts;
        const successMsg = (tunnel as any).successMsg;
        // this.logger.info('new stream==== for tunnel:', tunnel.id, JSON.stringify(tunnel.opts));
        const localPort = tunnelConf.localPort;
        this.updateConsole(tunnelConf, `${successMsg} ${chalk.green('->')}`);
        const client = dgram.createSocket('udp4');
        client.bind(); // bind random udp port
        const rst = new UdpOverTcpReadStream(client);
        rst.pipe(stream);

        const listenData = (buff: Buffer) => {
            client.send(buff, localPort, '127.0.0.1', (err, bytes) => {
                if (err) {
                    stream.emit('error', Error(err.message));
                } else {
                    this.updateConsole(tunnelConf, `${successMsg} ${chalk.green('<->')}`);
                }
            });
        };
        const listenError = (err: Error) => {
            console.log('stream err:', err);
        };

        bindStreamSocket(stream, listenData, listenError, () => {
            stream.emit('error', Error('closed'));
            client.close();
        });
        tunnel.setReady(stream);
    }
    handleTcpStream(tunnel: Tunnel, stream: any) {
        const tunnelConf = tunnel.opts as TunnelOpts;
        const successMsg = (tunnel as any).successMsg;
        // this.logger.info('new stream==== for tunnel:', tunnel.id, JSON.stringify(tunnel.opts));
        const localPort = tunnelConf.localPort;
        this.updateConsole(tunnelConf, `${successMsg} ${chalk.green('->')}`);
        const localsocket = new net.Socket();
        let aborted = false;
        // this.logger.info('connect 127.0.0.1:' + localPort);
        localsocket.connect(localPort, '127.0.0.1', () => {
            if (aborted) return;
            clearTimeout(timeoutid);
            // this.logger.info('connect ok:', localPort);
            this.updateConsole(tunnelConf, `${successMsg} ${chalk.green('<->')}`);
            stream.pipe(localsocket);
            localsocket.pipe(stream);
            tunnel.setReady(stream);
        });
        localsocket.on('close', () => {
            this.updateConsole(tunnelConf, successMsg);
            stream.destroy();
        });
        localsocket.on('error', (err) => stream.destroy(err));
        stream.on('close', () => localsocket.destroy());

        var timeoutid = setTimeout(() => {
            aborted = true;
            this.updateConsole(tunnelConf, `${successMsg} ${chalk.yellow('->')}`);
            localsocket.emit('error', Error('socket ETIMEDOUT!'));
        }, 15 * 1000);
    }

    handleStream(tunnel: Tunnel, stream: any) {
        if (tunnel.opts?.tunType === 0x3) {
            this.handleUdpStream(tunnel, stream);
        } else {
            console.log('handle tcp stream===')
            this.handleTcpStream(tunnel, stream);
        }
    }
    setupStcpLocalPeer(tunnelConf: TunnelOpts, handler: (socket: net.Socket) => void) {
        console.log('setupStcpLocalPeer:===',tunnelConf.bindPort);
        return new Promise((resolve, reject) => {
            const server = net.createServer(handler);
            const hostname: string = tunnelConf.bindIp as string;
            server.listen(tunnelConf.bindPort, hostname, () => {
                this.logger.info(`stcp local listen on ${tunnelConf.bindIp}:${tunnelConf.bindPort}`);
                resolve('ok');
            });
            server.on('error', function(err) {
                reject(err);
            });
        });
    }

    async setupTunnel(tunnelConf: TunnelOpts) {
        const targetSocket = new net.Socket();
        // this.logger.info('creating tunnel:', name);
        // this.logger.info(`connecting ${this.serverHost}:${this.serverPort}`);
        this.updateConsole(tunnelConf, 'connecting');
        targetSocket.connect(this.serverPort, this.serverHost, () => {
            // this.logger.info('connect okok');
            this.updateConsole(tunnelConf, 'connect ok, starting auth');
            const tunnel = new Tunnel(targetSocket, tunnelConf);
            if (tunnelConf.tunType === 0x4 && tunnelConf.bindIp && tunnelConf.bindPort) {
                tunnel.on('prepared', () => {
                    // dispatch local stream to stcp peer stream
                    this.setupStcpLocalPeer(tunnelConf, (socket) => {
                        console.log('socket====>');
                        tunnel.createStream().then((stream) => {
                            console.log('stream ready====')
                            socket.pipe(stream);
                            stream.pipe(socket);
                        });
                    }).then((res) => {
                        console.log('res:', res);
                    });
                });
            } else {
                tunnel.on('stream', this.handleStream.bind(this, tunnel));
            }
            tunnel.on('authed', (message: string) => {
                this.updateConsole(tunnelConf, 'auth ==>' + message);
            });
            tunnel.on('prepared', (message: string) => {
                const proto = tunnelConf.tunType === 0x3 ? 'udp' : 'tcp';
                const successMsg = `${chalk.green('ok')}: ${message} => ${proto}://127.0.0.1:${tunnelConf.localPort}`;
                this.updateConsole(tunnelConf, successMsg);
                (tunnel as any).successMsg = successMsg;
            });
            tunnel.on('error', (err: Error) => {
                this.updateConsole(tunnelConf, `tunnel ${chalk.red('err')}:${err.message}`);
            });
            tunnel.startAuth('test:test124');
        });
        targetSocket.on('error', (err: Error) => {
            this.updateConsole(tunnelConf, err.message);
            // this.logger.error('connect err:', err.message, ' retrying');
        });
        targetSocket.on('close', () => {
            // this.logger.error('server is closed.');
            setTimeout(() => this.setupTunnel(tunnelConf), 3000);
        });
    }

    updateConsole(tunopts: TunnelOpts, statusText: string) {
        tunopts.status = statusText;
        this.showConsole();
    }

    showConsole() {
        const keys = Object.keys(this.tunnelsMap);
        let message = 'tunnel list:\n';
        keys.forEach((key: string) => {
            const tunnelConf = this.tunnelsMap[key];
            message += tunnelConf.name?.padEnd(16) + '';
            message += tunnelConf.status + '\n';
        });
        // console.log('tunnel===\n'+message);
        printer.printStatus(message);
    }

    bootstrap() {
        Object.values(this.tunnelsMap).forEach((temp: TunnelOpts) => this.setupTunnel(temp));
    }
}

export default Client;
