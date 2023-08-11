import net from 'net';
import { GankClientOpts, TunnelOpts } from './types/index';
import { AUTH_REQ, AUTH_RES, AuthFrame, PING_FRAME, PONG_FRAME, PongFrame, TUNNEL_REQ, TUNNEL_RES, TunnelReqFrame, TunnelResFrame, decode } from './protocol';
import { bindStreamSocket, tcpsocketSend } from './utils/socket';
import { getRamdomUUID } from './utils/uuid';
import { Tunnel } from './tunnel';
import GankStream from './tunnel/stream';

class Client {
    serverHost: string;
    serverPort: number;
    tunnelConfList: TunnelOpts[];
    tunnels: any;
    constructor(opts: GankClientOpts) {
        this.serverHost = opts.tunnelHost;
        this.serverPort = opts.tunnelAddr || 4443;
        this.tunnelConfList = opts.tunnels || [];
        this.tunnels = {};
    }

    handleData(conn: any, data: Buffer) {
        const self = this;
        try {
            const frame = decode(data);
            console.log('frame:',frame);
            if (conn.authed) {
                if (frame.type === PING_FRAME) {
                    const pongFrame = new PongFrame(PONG_FRAME, frame.stime, Date.now() + '');
                    tcpsocketSend(conn.socket, pongFrame.encode());
                    return;
                } else if (frame.type === TUNNEL_RES) {
                    const tunnel = self.tunnels[frame.tunnelId];
                    tunnel.on('stream', function(stream: any) {
                        const localPort = tunnel.opts.localPort;
                        const localsocket = new net.Socket();
                        console.log('connect 127.0.0.1:'+localPort);
                        localsocket.connect(localPort, '127.0.0.1', function() {
                            console.log('connect ok:',localPort);
                            stream.pipe(localsocket);
                            localsocket.pipe(stream);
                            tunnel.setReady(stream);
                        });
                        localsocket.on('close', ()=>stream.destroy());
                        localsocket.on('error', ()=>stream.destroy());
                        stream.on('close',()=>localsocket.destroy());

                    });
                }else if(frame.type>=0xf0){
                    const tunnel = self.tunnels[frame.tunnelId];
                    tunnel.dispatchFrame(frame);
                }
                return;
            }
            if (frame.type === AUTH_RES && frame.status === 0x1) {
                conn.authed = true;
                console.log('auth ok');
                self.setupTunnels(conn.socket);
            } else {
                console.log('auth failed');
                conn.socket.destroy();
            }
        } catch (err) {
            console.log(err);
        }
    }

    handleError(err: Error) {}

    handleClose() {}

    setupTunnels(socket: net.Socket) {
        this.tunnelConfList.forEach((tunopts) => {
            const pno = TunnelReqFrame.getProtocolNo(tunopts.protocol);
            const tid = getRamdomUUID();
            const tunnelreqFrame = new TunnelReqFrame(TUNNEL_REQ, tid, pno, pno === 0x1 ? tunopts.remotePort : tunopts.subdomain);
            tcpsocketSend(socket, tunnelreqFrame.encode());
            this.tunnels[tid] = new Tunnel(tid, socket, tunopts);
        });
    }

    bootstrap() {
        const targetSocket = new net.Socket();
        const self = this;
        targetSocket.connect(this.serverPort, this.serverHost, () => {
            console.log('connect okok');
            const conn = { socket: targetSocket, authed: false };
            bindStreamSocket(targetSocket, self.handleData.bind(self, conn), self.handleError.bind(self), self.handleClose.bind(self));
            let authReq = new AuthFrame(AUTH_REQ, '', 0);
            tcpsocketSend(targetSocket, authReq.encode());
        });
    }
}

export default Client;
