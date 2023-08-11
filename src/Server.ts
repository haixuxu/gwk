import net from 'net';
import { GankServerOpts } from './types/index';
import { AUTH_REQ, AUTH_RES, AuthFrame, PING_FRAME, PONG_FRAME, PingFrame, TUNNEL_REQ, TUNNEL_RES, TunnelReqFrame, TunnelResFrame, decode } from './protocol';
import { bindStreamSocket, tcpsocketSend } from './utils/socket';
import { getRamdomUUID } from './utils/uuid';
import { Tunnel } from './tunnel';

class Server {
    private listenPort: number;
    private connections: any;
    private tunnels: any;
    constructor(opts: GankServerOpts) {
        this.listenPort = opts.tunnelAddr || 4443;
        this.connections = {};
        this.tunnels = {};
    }

    setupTunnel(conn: any, frame: TunnelReqFrame) {
        const self = this;
        if (frame.protocol === 0x1) {
            const opts = { localPort: frame.port, protocol: frame.protocol };
            const tunnelObj = new Tunnel(frame.tunnelId, conn.socket, opts as any);
            const server = net.createServer(function(socket2) {
                console.log('handle socket on ', frame.port);
                tunnelObj
                    .createStream()
                    .then((stream: any) => {
                        socket2.pipe(stream);
                        stream.pipe(socket2);

                        socket2.on('close', () => stream.destroy());
                        socket2.on('error', () => stream.destroy());
                        stream.on('close', () => socket2.destroy());
                    })
                    .catch((err: Error) => {
                        console.log('err:', err);
                        socket2.write('service invalid!');
                    });
            });
            server.listen(frame.port, () => {
                console.log('server listen on 127.0.0.1:' + frame.port);
                // create tunnel for tcp ok
                const tunresframe = new TunnelResFrame(TUNNEL_RES, frame.tunnelId, 0x1);
                tcpsocketSend(conn.socket, tunresframe.encode());
                self.tunnels[frame.tunnelId] = tunnelObj;
            });
        } else if (frame.protocol === 0x2) {
        } else if (frame.protocol === 0x3) {
        }
    }

    handleError(conn: any, err: Error) {
        console.log('err:', err);
    }

    handleData(conn: any, data: Buffer) {
        try {
            const frame = decode(data);
            console.log('frame:', frame);
            if (frame.type === AUTH_REQ) {
                const fm = new AuthFrame(AUTH_RES, frame.token, 1);
                tcpsocketSend(conn.socket, fm.encode());
                this.connections[conn.cid] = conn;
            } else if (frame.type === PONG_FRAME) {
                // console.log('rtt:', Date.now() - parseInt(frame.stime));
            } else if (frame.type === TUNNEL_REQ) {
                this.setupTunnel(conn, frame);
            } else if (frame.type >= 0xf0) {
                const tunnel = this.tunnels[frame.tunnelId];
                tunnel.dispatchFrame(frame);
            }
        } catch (error) {
            console.log('error:', error);
        }
    }

    handleClose(conn: any) {
        delete this.connections[conn.connectionId];
    }

    handleConection(socket: net.Socket) {
        // handleAuth
        // registerTunnel
        // response tunnel OK
        const self = this;
        const cid = getRamdomUUID();
        const conn: any = { cid, socket };
        bindStreamSocket(socket, self.handleData.bind(self, conn), self.handleError.bind(self, conn), self.handleClose.bind(self, conn));
    }

    keepOnline() {
        setTimeout(() => {
            const delList:string[] = [];
            Object.keys(this.connections).forEach((key) => {
                const conn = this.connections[key];
                const pingFrame = new PingFrame(PING_FRAME, Date.now() + '');
                try {
                    tcpsocketSend(conn.socket, pingFrame.encode());
                } catch (err) {
                    delList.push(key);
                }
            });
            delList.forEach(key=>{
                delete this.connections[key]
            });
            this.keepOnline();
        }, 3000);
    }

    bootstrap() {
        const server = net.createServer(this.handleConection.bind(this));
        this.keepOnline();
        server.listen(this.listenPort, () => {
            console.log('server listen on 127.0.0.1:' + this.listenPort);
        });
    }
}

export default Server;
