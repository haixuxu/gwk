import net from 'net';
import http from 'http';
import https from 'https';
import { GankServerOpts } from './types/index';
import { AUTH_REQ, AUTH_RES, AuthFrame, PING_FRAME, PONG_FRAME, PingFrame, TUNNEL_REQ, TUNNEL_RES, TunnelReqFrame, TunnelResFrame, decode } from './protocol';
import { bindStreamSocket, tcpsocketSend } from './utils/socket';
import { getRamdomUUID } from './utils/uuid';
import { Tunnel } from './tunnel';
import { buildHeader } from './utils/header';

class Server {
    private listenPort: number;
    private connections: any;
    private tunnels: Record<string, Tunnel>;
    listenHttpPort: number;
    listenHttpsPort: number;
    tlsOpts: { key: string | undefined; cert: string | undefined };
    webTunnels: Record<string, Tunnel>;
    serverHost: string;
    constructor(opts: GankServerOpts) {
        this.listenPort = opts.tunnelAddr || 4443;
        this.listenHttpPort = opts.httpAddr || 80;
        this.listenHttpsPort = opts.httpsAddr || 443;
        this.serverHost = opts.domain || 'gank007.com';
        this.connections = {};
        this.tunnels = {};
        this.tlsOpts = {
            key: opts.tlsKey,
            cert: opts.tlsCrt,
        };
        this.webTunnels = {};
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
        } else {
            const opts = { localPort: frame.port, protocol: frame.protocol };
            if (!frame.subdomain) {
                console.log('error: subdomain missing');
                return;
            }
            const tunnelObj = new Tunnel(frame.tunnelId, conn.socket, opts as any);
            // create tunnel for tcp ok
            const tunresframe = new TunnelResFrame(TUNNEL_RES, frame.tunnelId, 0x1);
            tcpsocketSend(conn.socket, tunresframe.encode());

            const subdomainfull = frame.subdomain + '.' + this.serverHost;
            self.tunnels[frame.tunnelId] = tunnelObj;
            self.webTunnels[subdomainfull] = tunnelObj;
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
                if(tunnel){
                    tunnel.dispatchFrame(frame);
                }
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
            const delList: string[] = [];
            Object.keys(this.connections).forEach((key) => {
                const conn = this.connections[key];
                const pingFrame = new PingFrame(PING_FRAME, Date.now() + '');
                try {
                    tcpsocketSend(conn.socket, pingFrame.encode());
                } catch (err) {
                    delList.push(key);
                }
            });
            delList.forEach((key) => {
                delete this.connections[key];
            });
            this.keepOnline();
        }, 3000);
    }

    handleHttpRequest(req: any, res: any) {
        let host = req.headers['host'];
        host = host.replace(/:\d+$/, '');
        console.log('webTunnels:', Object.keys(this.webTunnels));
        const tunnel = this.webTunnels[host];
        if (!tunnel) {
            res.end('service host missing!');
            return;
        }
        tunnel
            .createStream()
            .then((stream: any) => {
                console.log('pipe to stream===>');
                stream.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`);
                stream.write(buildHeader(req.rawHeaders));
                stream.write('\r\n');
                req.on('data',function(data:Buffer){
                    stream.write(data);
                });
                stream.pipe(res);
                req.on('close', () => stream.destroy());
                stream.on('close', () => res.destroy());
            })
            .catch((err: Error) => {
                console.log('err:', err);
            });
    }

    bootstrap() {
        const server = net.createServer(this.handleConection.bind(this));
        // this.keepOnline();
        server.listen(this.listenPort, () => {
            console.log('server listen on 127.0.0.1:' + this.listenPort);
        });

        const httpserver = http.createServer(this.handleHttpRequest.bind(this));
        httpserver.listen(this.listenHttpPort, () => {
            console.log('http server listen on 127.0.0.1:' + this.listenHttpPort);
        });
        console.log(this.tlsOpts);
        const httpsserve = https.createServer(this.tlsOpts, this.handleHttpRequest.bind(this));
        httpsserve.listen(this.listenHttpsPort, () => {
            console.log('https server listen on 127.0.0.1:' + this.listenHttpsPort);
        });
    }
}

export default Server;
