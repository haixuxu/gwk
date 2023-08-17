import net from 'net';
import { GankClientOpts, TunnelOpts } from './types/index';
import { AUTH_REQ, AUTH_RES, AuthFrame, PING_FRAME, PONG_FRAME, PongFrame, TUNNEL_REQ, TUNNEL_RES, TunnelReqFrame, TunnelResFrame, decode } from './protocol';
import { bindStreamSocket, tcpsocketSend } from './utils/socket';
import { Tunnel } from './tunnel';
import getCustomLogger, { Logger } from './utils/logger';
import chalk from 'chalk';
import printer from './utils/printer';
// import { stringifyExclude } from './utils/replacer';

class Client {
    serverHost: string;
    serverPort: number;
    tunnelsMap: Record<string, TunnelOpts>;
    logger: Logger;
    constructor(opts: GankClientOpts) {
        this.serverHost = opts.tunnelHost;
        this.serverPort = opts.tunnelAddr || 4443;
        this.tunnelsMap = opts.tunnels || {};
        this.logger = getCustomLogger('c>', 'debug');
    }

    handleAuth(conn: any, frame: any) {
        if (conn.authed) return;
        if (frame.type === AUTH_RES && frame.status === 0x1) {
            conn.authed = true;
            // this.logger.info('auth ok');
            conn.tunnelConf.status = 'auth ok';
            const tunopts = conn.tunnelConf;
            const pno = TunnelReqFrame.getProtocolNo(tunopts.protocol);
            let port = pno === 0x1 ? tunopts.remotePort : 0;
            let subdomain = pno === 0x1 ? '' : tunopts.subdomain;
            const tunnelreqFrame = new TunnelReqFrame(TUNNEL_REQ, pno, tunopts.name, port, subdomain);
            tcpsocketSend(conn.socket, tunnelreqFrame.encode());
            conn.tunnel = new Tunnel(conn.socket, tunopts);
        } else {
            throw Error('auth failed');
        }
    }

    handleData(connObj: any, data: Buffer) {
        const self = this;
        try {
            const frame = decode(data);
            this.handleAuth(connObj, frame);
            // this.logger.info('frame:', frame);
            if (frame.type === PING_FRAME) {
                const pongFrame = new PongFrame(PONG_FRAME, frame.stime, Date.now() + '');
                tcpsocketSend(connObj.socket, pongFrame.encode());
                return;
            }
            if (frame.type >= 0xf0) {
                connObj.tunnel.dispatchFrame(frame);
                return;
            }
            if (frame.type === TUNNEL_RES) {
                if (frame.status !== 0x1) {
                    throw Error(frame.message);
                    // connObj.tunnelConf.status = 'req tunnel failed!' + frame.message;
                    // this.logger.error('req tunnel failed:', frame.message);
                    return;
                }
                const tunnel = connObj.tunnel;

                const successMsg = `tunnel ${chalk.green("ok")}: ${frame.message} => tcp://127.0.0.1:${tunnel.opts.localPort}`
                connObj.tunnelConf.status = successMsg;
                // this.logger.info(`tunnel setup ok: ${frame.message} => tcp://127.0.0.1:${tunnel.opts.localPort}`);
                tunnel.on('stream', (stream: any) => {
                    // this.logger.info('new stream==== for tunnel:', tunnel.id, JSON.stringify(tunnel.opts));
                    const localPort = tunnel.opts.localPort;
                    const localsocket = new net.Socket();
                    connObj.tunnelConf.status = `${successMsg} ${chalk.green('->')}`;
                    // this.logger.info('connect 127.0.0.1:' + localPort);
                    localsocket.connect(localPort, '127.0.0.1', () => {
                        // this.logger.info('connect ok:', localPort);
                        connObj.tunnelConf.status = `${successMsg} ${chalk.green('<->')}`;
                        stream.pipe(localsocket);
                        localsocket.pipe(stream);
                        tunnel.setReady(stream);
                    });
                    localsocket.on('close', () => {
                        connObj.tunnelConf.status = successMsg;
                        stream.destroy();
                    });
                    localsocket.on('error', () => stream.destroy());
                    stream.on('close', () => localsocket.destroy());
                });
            }
            return;
        } catch (err) {
            connObj.tunnelConf.status = `tunnel ${chalk.red('failed')}:` + (err as Error).message;
            // this.logger.error((err as any).message);
            connObj.socket.destroy();
        }
    }

    handleError(err: Error) {}

    handleClose() {}

    setupTunnel(tunnelConf: TunnelOpts) {
        const targetSocket = new net.Socket();
        const self = this;
        // this.logger.info('creating tunnel:', name);
        // this.logger.info(`connecting ${this.serverHost}:${this.serverPort}`);
        tunnelConf.status = 'connecting';
        targetSocket.connect(this.serverPort, this.serverHost, () => {
            // this.logger.info('connect okok');
            tunnelConf.status = 'connect ok, starting auth';
            const connObj = { socket: targetSocket, authed: false, tunnelConf };
            bindStreamSocket(targetSocket, self.handleData.bind(self, connObj), self.handleError.bind(self), self.handleClose.bind(self));
            let authReq = new AuthFrame(AUTH_REQ, '', 0);
            tcpsocketSend(targetSocket, authReq.encode());
        });
        targetSocket.on('error', (err: Error) => {
            tunnelConf.status = 'connect err:' + err.message;
            // this.logger.error('connect err:', err.message, ' retrying');
        });
        targetSocket.on('close', () => {
            // this.logger.error('server is closed.');
            // tunnelConf.status='connect err:', err.message;
            setTimeout(() => this.setupTunnel(tunnelConf), 3000);
        });
    }

    showConsole() {
        const keys = Object.keys(this.tunnelsMap);
        let message = 'tunnel list:\n';
        let linesCount = keys.length + 1;
        keys.forEach((key: string) => {
            const tunnelConf = this.tunnelsMap[key];
            message += tunnelConf.name?.padEnd(16) + '';
            message += tunnelConf.status + '\n';
        });
        // console.log('tunnel===\n'+message);
        printer.printStatus(message, linesCount);
    }

    bootstrap() {
        const self = this;
        Object.entries(this.tunnelsMap || {}).forEach(function (values: any) {
            values[1].name = values[0];
            values[1].status = ' starting tunnel ' + values[0];
        });

        Object.keys(this.tunnelsMap).forEach((key: string) => {
            const tunnelConf = this.tunnelsMap[key];
            const proxyConf = new Proxy(tunnelConf, {
                get: function (target: any, prop) {
                    return target[prop];
                },
                set: function (target: any, prop, value: any) {
                    target[prop] = value;
                    if (prop === 'status') {
                        self.showConsole();
                    }
                    return true;
                },
            });
            return this.setupTunnel(proxyConf);
        });
    }
}

export default Client;
