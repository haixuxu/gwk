import net from 'net';
import { GankClientOpts, TunnelOpts } from './types/index';
import { AUTH_REQ, AUTH_RES, AuthFrame, PING_FRAME, PONG_FRAME, PongFrame, TUNNEL_REQ, TUNNEL_RES, TunnelReqFrame, TunnelResFrame, decode } from './protocol';
import { bindStreamSocket, tcpsocketSend } from './utils/socket';
import { getRamdomUUID } from './utils/uuid';
import { Tunnel } from './tunnel';
import getCustomLogger, { Logger } from './utils/logger';
import { stringifyExclude } from './utils/replacer';

class Client {
    serverHost: string;
    serverPort: number;
    tunnelConfList: TunnelOpts[];
    tunnels: any;
    logger: Logger;
    constructor(opts: GankClientOpts) {
        this.serverHost = opts.tunnelHost;
        this.serverPort = opts.tunnelAddr || 4443;
        this.tunnelConfList = opts.tunnels || [];
        this.tunnels = {};
        this.logger = getCustomLogger('c>', 'debug');
    }

    handleData(conn: any, data: Buffer) {
        const self = this;
        try {
            const frame = decode(data);
            // this.logger.info('frame:', frame);
            if (conn.authed) {
                if (frame.type === PING_FRAME) {
                    const pongFrame = new PongFrame(PONG_FRAME, frame.stime, Date.now() + '');
                    tcpsocketSend(conn.socket, pongFrame.encode());
                    return;
                } else if (frame.type === TUNNEL_RES) {
                    if(frame.status!==0x1){
                        this.logger.error('req tunnel failed:',frame.message);
                        return;
                    }
                    const tunnel = self.tunnels[frame.tunnelId];
                    this.logger.info(`tunnel setup ok:${frame.message}`);
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
                } else if (frame.type >= 0xf0) {
                    const tunnel = self.tunnels[frame.tunnelId];
                    tunnel.dispatchFrame(frame);
                }
                return;
            }
            if (frame.type === AUTH_RES && frame.status === 0x1) {
                conn.authed = true;
                this.logger.info('auth ok');
                self.setupTunnels(conn.socket);
            } else {
                this.logger.info('auth failed');
                conn.socket.destroy();
            }
        } catch (err) {
            this.logger.error((err as any).message);
        }
    }

    handleError(err: Error) {}

    handleClose() {}

    setupTunnels(socket: net.Socket) {
        this.tunnelConfList.forEach((tunopts:any) => {
            if(!tunopts.tid){
                tunopts.tid = getRamdomUUID();
            }
            this.logger.info("req tunnel:"+JSON.stringify(tunopts,stringifyExclude.bind(null,'tid')));
            const pno = TunnelReqFrame.getProtocolNo(tunopts.protocol);
            const tid = tunopts.tid;
            const tunnelreqFrame = new TunnelReqFrame(TUNNEL_REQ, tid, pno, pno === 0x1 ? tunopts.remotePort : tunopts.subdomain);
            tcpsocketSend(socket, tunnelreqFrame.encode());
            this.tunnels[tid] = new Tunnel(tid, socket, tunopts);
        });
    }

    bootstrap(retry?:boolean) {
        const targetSocket = new net.Socket();
        const self = this;
        this.logger.info(`${retry?'re':''}connecting ${this.serverHost}:${this.serverPort}`);
        targetSocket.connect(this.serverPort, this.serverHost, () => {
            this.logger.info('connect okok');
            const conn = { socket: targetSocket, authed: false };
            bindStreamSocket(targetSocket, self.handleData.bind(self, conn), self.handleError.bind(self), self.handleClose.bind(self));
            let authReq = new AuthFrame(AUTH_REQ, '', 0);
            tcpsocketSend(targetSocket, authReq.encode());
        });
        targetSocket.on('error', (err: Error) => {
            this.logger.error('connect err:', err.message);
        });
        targetSocket.on('close',()=>{
            this.logger.error('server is closed.');
            setTimeout(()=>this.bootstrap(true),3000);
        });
    }
}

export default Client;
