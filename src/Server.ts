import net from 'net';
import http from 'http';
import https from 'https';
import { GankServerOpts } from './types/index';
import { AUTH_REQ, AUTH_RES, AuthFrame, PING_FRAME, PONG_FRAME, PingFrame, TUNNEL_REQ, TUNNEL_RES, TunnelReqFrame, TunnelResFrame, decode } from './protocol';
import { bindStreamSocket, tcpsocketSend } from './utils/socket';
import { getRamdomUUID } from './utils/uuid';
import { Tunnel } from './tunnel';
import { buildHeader } from './utils/header';
import getCustomLogger, { Logger } from './utils/logger';
class Server {
    private listenPort: number;
    private connections: any;
    private tunnels: Record<string, Tunnel>;
    listenHttpPort: number;
    listenHttpsPort: number;
    tlsOpts: { key: string | undefined; cert: string | undefined };
    webTunnels: Record<string, Tunnel>;
    serverHost: string;
    logger: Logger;
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
        this.logger = getCustomLogger('svc', 'debug');
    }

    setupTunnel(conn: any, frame: TunnelReqFrame) {
        const self = this;
        if (frame.protocol === 0x1) {
            const opts = { localPort: frame.port, protocol: frame.protocol };
            const tunnelObj = new Tunnel(frame.tunnelId, conn.socket, opts as any);
            const server = net.createServer( (socket2)=> {
                this.logger.info('handle socket on ', frame.port+'');
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
                        this.logger.info('err:', err.message);
                        socket2.write('service invalid!');
                    });
            });
            server.listen(frame.port, () => {
                this.logger.info('server listen on 127.0.0.1:' + frame.port);
                // create tunnel for tcp ok
                const tunresframe = new TunnelResFrame(TUNNEL_RES, frame.tunnelId, 0x1);
                tcpsocketSend(conn.socket, tunresframe.encode());
                self.tunnels[frame.tunnelId] = tunnelObj;
            });
        } else {
            const opts = { localPort: frame.port, protocol: frame.protocol };
            if (!frame.subdomain) {
                this.logger.info('error: subdomain missing');
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
        this.logger.info('err:', err.message);
    }

    handleData(conn: any, data: Buffer) {
        try {
            const frame = decode(data);
            // this.logger.info('frame:', frame);
            if (frame.type === AUTH_REQ) {
                const fm = new AuthFrame(AUTH_RES, frame.token, 1);
                tcpsocketSend(conn.socket, fm.encode());
                this.connections[conn.cid] = conn;
            } else if (frame.type === PONG_FRAME) {
                // this.logger.info('rtt:', Date.now() - parseInt(frame.stime));
            } else if (frame.type === TUNNEL_REQ) {
                this.setupTunnel(conn, frame);
            } else if (frame.type >= 0xf0) {
                const tunnel = this.tunnels[frame.tunnelId];
                if (tunnel) {
                    tunnel.dispatchFrame(frame);
                }
            }
        } catch (error) {
            this.logger.info('error:', error);
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
        this.logger.info('webTunnels:', Object.keys(this.webTunnels));
        const tunnel = this.webTunnels[host];
        if (!tunnel) {
            res.end('service host missing!');
            return;
        }
        tunnel
            .createStream()
            .then((stream: any) => {
                // 获取已连接的套接字
                const socket = req.socket;
                const headerStr = buildHeader(req.rawHeaders);
                // 将请求头和正文写入套接字
                stream.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n${headerStr}\r\n`);
                res.detachSocket(socket);
                socket.pipe(stream);
                stream.pipe(socket);

                req.on('close', () => {
                    this.logger.info('req close=====');
                });
                stream.on('close', () => {
                    this.logger.info('stream close====');
                    socket.destroy();
                });
            })
            .catch((err: Error) => {
                this.logger.info('err:', err);
            });
    }

    bootstrap() {
        const server = net.createServer(this.handleConection.bind(this));
        // this.keepOnline();
        server.listen(this.listenPort, () => {
            this.logger.info('server listen on 127.0.0.1:' + this.listenPort);
        });

        const httpserver = http.createServer(this.handleHttpRequest.bind(this));
        httpserver.listen(this.listenHttpPort, () => {
            this.logger.info('http server listen on 127.0.0.1:' + this.listenHttpPort);
        });
        this.logger.info(this.tlsOpts);
        const httpsserve = https.createServer(this.tlsOpts, this.handleHttpRequest.bind(this));
        httpsserve.listen(this.listenHttpsPort, () => {
            this.logger.info('https server listen on 127.0.0.1:' + this.listenHttpsPort);
        });
    }
}

export default Server;
