import net from 'net';
import tls from 'tls';
import dgram from 'dgram';
import { ConnectObj, GankServerOpts, tuntype2Str } from './types/index';
import { Tunnel } from './tunnel';
import getCustomLogger, { Logger } from './utils/logger';
import { HeaderTransform, HttpReq } from './stream/header';
import { getRamdomUUID } from './utils/uuid';
import { bindStreamSocket, tcpsocketSend } from './utils/socket';
import GankStream from './stream/gank';
import { buildIpAddrBuffer, parseIpAddrBuffer } from './utils/ipaddr';
class Server {
    private listenPort: number;
    private connections: any;
    listenHttpPort: number | undefined;
    listenHttpsPort: number | undefined;
    tlsOpts: { ca: string | undefined; key: string | undefined; cert: string | undefined };
    webTunnels: Record<string, ConnectObj>;
    stcpTunnels: Record<string, ConnectObj>;
    serverHost: string;
    connectMap: Record<string, ConnectObj>;
    logger: Logger;
    constructor(opts: GankServerOpts) {
        this.listenPort = opts.serverPort || 4443;
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
        this.stcpTunnels = {};
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
        if (conn.secretKey) {
            delete this.stcpTunnels[conn.secretKey];
            this.logger.info(`release tunnel unbind   on :${conn.secretKey}`);
        }
    }

    handleAuth(fm: any) {
        // console.log('handleAuth:', fm.token);
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

    async transformUdpSocket(connobj: ConnectObj, msg: Buffer, rinfo: dgram.RemoteInfo, udpsocket: dgram.Socket) {
        const clientHostPort = `${rinfo.address}:${rinfo.port}`;
        // 只使用一个stream, 避免多次创建
        if (!connobj.udpstream) {
            this.logger.info('create stream for', connobj.name);
            connobj.udpstream = await connobj.tunnel.createStream();
            const listenStreamData = (data: Buffer) => {
                const udpaddrbuf = data.slice(0, 6);
                const ipaddr = parseIpAddrBuffer(udpaddrbuf);
                const rawdata = data.slice(6);
                // console.log('send client===>',rawdata);
                // send to client
                udpsocket.send(rawdata, ipaddr.port, ipaddr.addr, (err) => {
                    if (err) {
                        console.log('err;', err);
                    }
                });
            };
            const logmsg: any = (err?: Error) => console.log(err || ' stream closed');
            bindStreamSocket(connobj.udpstream, listenStreamData, logmsg, logmsg);
        }
        this.logger.info(`handle client[udp:${clientHostPort}] packet for tunnel:${connobj.url} msglen:${msg.length}`);
        const stream = connobj.udpstream;
        const udpaddr = buildIpAddrBuffer(rinfo.address, rinfo.port);
        const udppacket = Buffer.concat([udpaddr, msg]);
      
        tcpsocketSend(stream, udppacket); // udp msg = >stream;
    }

    handleUdpTunnel(connobj: ConnectObj, fm: any) {
        return new Promise((resolve, reject) => {
            const server = dgram.createSocket('udp4');
            server.on('message', (msg: Buffer, rinfo: dgram.RemoteInfo) => {
                this.transformUdpSocket(connobj, msg, rinfo, server);
            });
            server.on('error', function (err) {
                reject(err);
            });
            server.bind(fm.port, () => {
                this.logger.info('udp tunnel listen on :' + fm.port);
                this.logger.info('tunnel listen on :' + fm.port);
                connobj.server = server;
                connobj.url = 'udp://' + this.serverHost + ':' + fm.port;
                connobj.name = fm.name;
                connobj.remotePort = fm.port;
                resolve(connobj.url);
            });
        });
    }

    handleTcpTunnel(connobj: ConnectObj, fm: any) {
        return new Promise((resolve, reject) => {
            const server = net.createServer((socket2) => {
                this.transformSocket(connobj, socket2, 'tcp');
            });
            server.listen(fm.port, () => {
                this.logger.info('tcp tunnel listen on :' + fm.port);
                connobj.server = server;
                connobj.url = 'tcp://' + this.serverHost + ':' + fm.port;
                connobj.server = server;
                connobj.name = fm.name;
                connobj.remotePort = fm.port;
                resolve(connobj.url);
            });
            server.on('error', function (err) {
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

    handleStcpTunnel(connobj: ConnectObj, fm: any) {
        return new Promise((resolve, reject) => {
            if (!fm.secretKey) {
                const err = Error('secretKey missing');
                this.logger.error(err.message);
                reject(err);
                return;
            }
            const secretKey = fm.secretKey;
            if (this.stcpTunnels[secretKey]) {
                const err = Error('secretKey existed!');
                this.logger.error(err.message);
                reject(err);
                return;
            }
            connobj.url = `${secretKey}`;
            connobj.name = fm.name;
            connobj.secretKey = secretKey;
            this.stcpTunnels[secretKey] = connobj;
            this.handleStcpDispatch(connobj, secretKey);
            resolve(connobj.url);
        });
    }

    handleStcpDispatch(connectObj: ConnectObj, secretKey: string) {
        // dispatch right stcp peer to left stcp peer;
        if (/stcp_right/.test(secretKey)) {
            const connobj = connectObj;
            const leftkey = secretKey.replace(/stcp_right/, 'stcp_left');
            connobj.tunnel.on('stream', (rightStream: GankStream) => {
                const peerConnObj = this.stcpTunnels[leftkey];
                if (!peerConnObj) {
                    rightStream.destroy();
                    return;
                }
                peerConnObj.tunnel
                    .createStream()
                    .then((stream: any) => {
                        this.logger.info(`create stream for ${connobj.name} to ${peerConnObj.name} ${secretKey}=>${leftkey}`);
                        connobj.tunnel.setReady(rightStream);
                        rightStream.pipe(stream);
                        stream.pipe(rightStream);
                        rightStream.on('close', () => stream.destroy());
                        rightStream.on('error', () => stream.destroy());
                        stream.on('close', () => rightStream.destroy());
                    })
                    .catch((err: Error) => {
                        this.logger.info('err:', err.message);
                        rightStream.write('service invalid!');
                    });
            });
        }
    }

    handleTunReq(connectObj: ConnectObj, fm: any) {
        this.logger.info('tunnel req:' + JSON.stringify(fm));
        connectObj.type = tuntype2Str[fm.tunType];
        if (fm.tunType === 0x1) {
            return this.handleTcpTunnel(connectObj, fm);
        } else if (fm.tunType === 0x2) {
            return this.handleWebTunnel(connectObj, fm);
        } else if (fm.tunType === 0x3) {
            return this.handleUdpTunnel(connectObj, fm);
        } else if (fm.tunType === 0x4) {
            return this.handleStcpTunnel(connectObj, fm);
        }
    }

    handleConection(socket: net.Socket) {
        const tunnel = new Tunnel(socket);
        const connectObj: ConnectObj = { tunnel, socket, url: '', rtt: 0 };
        const cid = getRamdomUUID();
        this.connectMap[cid] = connectObj;
        tunnel.registerHandler('auth', this.handleAuth.bind(this));
        tunnel.registerHandler('tunnel', this.handleTunReq.bind(this, connectObj));
        socket.on('close', () => {
            delete this.connectMap[cid];
            this.releaseConn(connectObj);
        });
        tunnel.on('pong', function ({ stime, atime }) {
            connectObj.rtt = Date.now() - stime;
            // console.log('===rtt:',connectObj.rtt);
            // console.log('====>',stime,atime);
        });
    }

    keepOnline() {
        setTimeout(() => {
            const delList: string[] = [];
            Object.keys(this.connectMap).forEach((key: string) => {
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
            // console.log(Object.keys(self.webTunnels));
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
                    socket.on('error', function (err) {
                        stream.destroy(err);
                    });
                })
                .catch((err: string) => {
                    self.logger.info('err:', err);
                    let msg = err;
                    if (/ECONNREFUSED/.test(msg)) {
                        socket.write(`HTTP/1.1 502 Bad Gateway\r\n\r\n502 Bad Gateway, message:${msg}!`);
                    } else if (/ETIMEDOUT/.test(msg)) {
                        socket.write(`HTTP/1.1 504 Gateway Timeout\r\n\r\n504 Gateway Timeout, message:${msg}!`);
                    } else {
                        socket.write(`HTTP/1.1 200 OK\r\n\r\n${msg}, please service is on!`);
                    }
                    socket.destroy();
                });

            return req;
        }

        // console.log('new transform stream===')
        const headerTransformer = new HeaderTransform(handlerReq);
        const pipestream = socket.pipe(headerTransformer);

        headerTransformer.on('error', function (err: Error) {
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
