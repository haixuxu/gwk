import net from 'net';
import { GankClientOpts, TunnelOpts } from './types/index';
import { AUTH_REQ, AUTH_RES, AuthFrame, PING_FRAME, PONG_FRAME, PongFrame, TUNNEL_REQ, TUNNEL_RES, TunnelReqFrame, TunnelResFrame, decode } from './protocol';
import { bindStreamSocket, tcpsocketSend } from './utils/socket';
import { Tunnel } from './tunnel';
import getCustomLogger, { Logger } from './utils/logger';
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
            this.logger.info('auth ok');
            const tunopts = conn.tunnelConf;
            const pno = TunnelReqFrame.getProtocolNo(tunopts.protocol);
            const tunnelreqFrame = new TunnelReqFrame(TUNNEL_REQ, pno, pno === 0x1 ? tunopts.remotePort : tunopts.subdomain);
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
                    this.logger.error('req tunnel failed:', frame.message);
                    return;
                }
                const tunnel = connObj.tunnel;
                this.logger.info(`tunnel setup ok: ${frame.message} => tcp://127.0.0.1:${tunnel.opts.localPort}`);
                tunnel.on('stream', (stream: any) => {
                    // this.logger.info('new stream==== for tunnel:', tunnel.id, JSON.stringify(tunnel.opts));
                    const localPort = tunnel.opts.localPort;
                    const localsocket = new net.Socket();
                    this.logger.info('connect 127.0.0.1:' + localPort);
                    localsocket.connect(localPort, '127.0.0.1', () => {
                        this.logger.info('connect ok:', localPort);
                        stream.pipe(localsocket);
                        localsocket.pipe(stream);
                        tunnel.setReady(stream);
                    });
                    localsocket.on('close', () => stream.destroy());
                    localsocket.on('error', () => stream.destroy());
                    stream.on('close', () => localsocket.destroy());
                });
            }
            return;
        } catch (err) {
            this.logger.error((err as any).message);
            connObj.socket.destroy();
        }
    }

    handleError(err: Error) {}

    handleClose() {}

    setupTunnel(name: string, tunnelConf: TunnelOpts) {
        tunnelConf.name = name;
        const targetSocket = new net.Socket();
        const self = this;
        this.logger.info('creating tunnel:', name);
        this.logger.info(`connecting ${this.serverHost}:${this.serverPort}`);
        targetSocket.connect(this.serverPort, this.serverHost, () => {
            this.logger.info('connect okok');
            const connObj = { socket: targetSocket, authed: false, tunnelConf };
            bindStreamSocket(targetSocket, self.handleData.bind(self, connObj), self.handleError.bind(self), self.handleClose.bind(self));
            let authReq = new AuthFrame(AUTH_REQ, '', 0);
            tcpsocketSend(targetSocket, authReq.encode());
        });
        targetSocket.on('error', (err: Error) => {
            this.logger.error('connect err:', err.message, ' retrying');
        });
        targetSocket.on('close', () => {
            this.logger.error('server is closed.');
            setTimeout(() => this.setupTunnel(name, tunnelConf), 3000);
        });
    }

    bootstrap() {
        Object.keys(this.tunnelsMap).forEach((key: string) => {
            return this.setupTunnel(key, this.tunnelsMap[key]);
        });
    }
}

export default Client;
