import net from 'net';
import tls from 'tls';
import { ConnectObj, GankServerOpts } from './types/index';
import { Tunnel } from './tunnel';
import getCustomLogger, { Logger } from './utils/logger';
import { HeaderTransform, HttpReq } from './transform';
import { getRamdomUUID } from './utils/uuid';
class Server {
    private listenPort: number;
    private connections: any;
    listenHttpPort: number | undefined;
    listenHttpsPort: number | undefined;
    tlsOpts: { ca: string | undefined; key: string | undefined; cert: string | undefined };
    webTunnels: Record<string, ConnectObj>;
    serverHost: string;
    connectMap:Record<string,ConnectObj>;
    logger: Logger;
    constructor(opts: GankServerOpts) {
        this.listenPort = opts.tunnelAddr || 4443;
        this.listenHttpPort = opts.httpAddr;
        this.listenHttpsPort = opts.httpsAddr;
        this.serverHost = opts.serverHost || 'gank007.com';
        this.connections = {};
        this.tlsOpts = {
            ca: opts.tlsCA,
            key: opts.tlsKey,
            cert: opts.tlsCrt,
        };
        this.webTunnels = {};
        this.connectMap = {};
        this.logger = getCustomLogger('s>', 'debug');
    }

    handleError(conn: any, err: Error) {
        this.logger.info('err:', err.message);
    }

    releaseConn(conn: ConnectObj) {
        if (conn.server) {
            this.logger.info(`release tunnel unlisten on :${conn.remotePort}`);
            conn.server.close();
        }
        const fulldomain = conn.fulldomain;
        if (fulldomain) {
            delete this.webTunnels[fulldomain];
            this.logger.info(`release tunnel unbind   on :${conn.fulldomain}`);
        }
    }

    handleAuth(fm: any) {
        console.log('handleAuth:', fm.token);
        return Promise.resolve('do success!!!');
    }

    transformSocket(connobj: ConnectObj, socket2: net.Socket, type: string) {
        this.logger.info(`handle socket for tunnel:${connobj.url}`);
        connobj.tunnel
            .createStream()
            .then((stream: any) => {
                this.logger.info('create stream for', connobj.name);
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
    }

    handleTcpTunnel(connobj: ConnectObj, fm: any) {
        return new Promise((resolve, reject) => {
            const server = net.createServer((socket2) => {
                this.transformSocket(connobj, socket2, 'tcp');
            });
            server.listen(fm.port, () => {
                this.logger.info('tunnel listen on :' + fm.port);
                connobj.server = server;
                connobj.url = 'tcp://' + this.serverHost + ':' + fm.port;
                connobj.server = server;
                connobj.name = fm.name;
                connobj.remotePort = fm.port;
                resolve(connobj.url);
            });
            server.on('error', function(err) {
                reject(err);
            });
        });
    }

    handleWebTunnel(connobj: ConnectObj, fm: any) {
        return new Promise((resolve, reject) => {
            if (!fm.subdomain) {
                const err = Error('subdomain missing');
                this.logger.error(err.message);
                reject(err);
                return;
            }
            const subdomainfull = fm.subdomain + '.' + this.serverHost;

            if (this.webTunnels[subdomainfull]) {
                const err = Error('subdomain existed!');
                this.logger.error(err.message);
                reject(err);
                return;
            }
            connobj.url = `http://${subdomainfull}/`;
            connobj.name = fm.name;
            connobj.fulldomain = subdomainfull;
            this.webTunnels[subdomainfull] = connobj;
            resolve(connobj.url);
        });
    }

    handleTunReq(connectObj: ConnectObj, fm: any) {
        if (fm.protocol === 0x1) {
            connectObj.type = 'tcp';
            return this.handleTcpTunnel(connectObj, fm);
        } else {
            connectObj.type = 'web';
            return this.handleWebTunnel(connectObj, fm);
        }
    }

    handleConection(socket: net.Socket) {
        const tunnel = new Tunnel(socket);
        const connectObj:ConnectObj = { tunnel, socket, url: '',rtt:0 };
        const cid = getRamdomUUID();
        this.connectMap[cid]=connectObj;
        tunnel.registerHandler('auth', this.handleAuth.bind(this));
        tunnel.registerHandler('tunnel', this.handleTunReq.bind(this, connectObj));
        socket.on('close',()=>{
            delete this.connectMap[cid];
            this.releaseConn(connectObj);
        });
        tunnel.on('pong',function({stime,atime}){
            connectObj.rtt = Date.now()-stime;
            // console.log('===rtt:',connectObj.rtt);
            // console.log('====>',stime,atime);
        })
    }

    keepOnline() {
        setTimeout(() => {
            const delList: string[] = [];
            Object.keys(this.connectMap).forEach((key:string) => {
                try {
                    const connobj = this.connectMap[key];
                    connobj.tunnel.ping();
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

    handleHttpRequest(socket: net.Socket) {
        const self = this;
        function handlerReq(req: HttpReq) {
            let host = req.host;
            host = host.replace(/:\d+$/, '');
            // this.logger.info('webTunnels:', Object.keys(this.webTunnels));
            console.log(Object.keys(self.webTunnels));
            const connobj = self.webTunnels[host];
            if (!connobj) {
                throw Error('service host missing');
            }
            const tunnel = connobj.tunnel;
            tunnel
                .createStream()
                .then((stream: any) => {
                    // this.logger.info('create stream for host:', host);
                    self.logger.info('create stream on tunnel:', connobj.name);
                    pipestream.pipe(stream);
                    stream.pipe(socket);
                    stream.on('close', () => {
                        self.logger.info('stream close====', host);
                        socket.destroy();
                    });
                    socket.on('error', function(err) {
                        stream.destroy(err);
                    });
                })
                .catch((err: string) => {
                    self.logger.info('err:', err);
                    socket.write(`HTTP/1.1 200 OK\r\n\r\n${err}!`);
                    socket.destroy();
                });

            return req;
        }

        // console.log('new transform stream===')
        const headerTransformer = new HeaderTransform(handlerReq);
        const pipestream = socket.pipe(headerTransformer);

        headerTransformer.on('error', function(err: Error) {
            // console.log('===err:',err);
            socket.write(`HTTP/1.1 200 OK\r\n\r\n${err.message}!`);
            socket.destroy();
        });
    }

    bootstrap() {
        const server = net.createServer(this.handleConection.bind(this));
        this.keepOnline();
        server.listen(this.listenPort, () => {
            this.logger.info('server listen on 127.0.0.1:' + this.listenPort);
        });

        if (this.listenHttpPort) {
            const httpServer = net.createServer(this.handleHttpRequest.bind(this));
            httpServer.listen(this.listenHttpPort, () => {
                this.logger.info('http server listen on 127.0.0.1:' + this.listenHttpPort);
            });
        }
        if (this.listenHttpsPort) {
            const httpsServer = tls.createServer(this.tlsOpts, this.handleHttpRequest.bind(this));
            httpsServer.listen(this.listenHttpsPort, () => {
                this.logger.info('https server listen on 127.0.0.1:' + this.listenHttpsPort);
            });
        }
    }
}

export default Server;
