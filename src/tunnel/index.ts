import net from 'net';
import GankStream from '../stream/gank';
import { getRamdomUUID } from '../utils/uuid';
import { deferred, Deferred } from '../utils/defered';
import { STREAM_DATA, STREAM_EST, STREAM_FIN, STREAM_INIT, STREAM_RST, Frame, encode, AUTH_REQ, decode, AUTH_RES, TUNNEL_REQ, TUNNEL_RES, PING_FRAME, PONG_FRAME } from '../protocol';
import { bindStreamSocket, tcpsocketSend } from '../utils/socket';
import EventEmitter from 'events';
import { TunnelOpts } from '../types';
import { frameSegment } from '../protocol/segment';

type Handler = (fm: Frame) => Promise<any>;
export class Tunnel extends EventEmitter {
    socket: net.Socket;
    defers: any;
    opts?:TunnelOpts;
    streams: Record<string, GankStream>;
    handlers: Record<string, Handler>;
    authDefer: Deferred<string>;
    prepareDefer: Deferred<string>;
    constructor(socket: net.Socket) {
        super();
        this.socket = socket;
        this.defers = {};
        this.streams = {};
        this.handlers = {};
        this.authDefer = deferred();
        this.prepareDefer = deferred();
        bindStreamSocket(socket, this.dataListener.bind(this), this.handleError.bind(this), this.handleClose.bind(this));
    }

    sendFrame(frame: Frame) {
        try {
            const binaryData = encode(frame);
            tcpsocketSend(this.socket, binaryData);
        } catch (error) {
            // ignore
            // console.log('send frame to socket err:', error);
        }
    }
    resetStream(streamId: string, message: string) {
        const rstFrame = { type: STREAM_RST, streamId, data: Buffer.from(message) };
        this.sendFrame(rstFrame);
    }
    closeStream(streamId: string) {
        const finFrame = { type: STREAM_FIN, streamId, data: Buffer.from([0x1, 0x2]) };
        this.sendFrame(finFrame);
    }
    emitStreamEvent(stream: GankStream) {
        stream.on('close', () => this.closeStream(stream.id));
        stream.on('error', (err: Error) => {
            // console.log(err)
            this.resetStream(stream.id, err.message);
        });
        stream.isReady = true;
        this.emit('stream', stream);
    }

    sendStreamFrame(frame: Frame) {
        const listFrames = frameSegment(frame);
        listFrames.forEach((temp) => this.sendFrame(temp));
    }

    sendCtrlFrame(type: number, status: number, message: string) {
        this.sendFrame({ type, status, message });
    }

    handleAuth(frame: Frame) {
        const authHanler = this.handlers['auth'];
        if (!authHanler) {
            this.sendCtrlFrame(AUTH_RES, 0x1, 'ok');
            return;
        }
        // prettier-ignore
        authHanler(frame).then((ret) => this.sendCtrlFrame(AUTH_RES, 0x1, ret)).catch((err) => this.sendCtrlFrame(AUTH_RES, 0x2, err.message));
    }

    handleTunnelReq(frame: Frame) {
        const tunnelHanler = this.handlers['tunnel'];
        if (!tunnelHanler) {
            throw Error('missing tunnel handler');
        }
        // prettier-ignore
        tunnelHanler(frame).then((ret) => this.sendCtrlFrame(TUNNEL_RES, 0x1, ret)).catch((err) => this.sendCtrlFrame(TUNNEL_RES, 0x2, err.message));
    }

    registerHandler(type: string, handler: any) {
        this.handlers[type] = handler;
    }

    handleClose() {
        Object.values(this.streams).forEach((temp) => temp.destroy());
        this.streams = {};
    }
    handleError(err: Error) {
        // console.log('===err:', err);
    }
    dataListener(data: Buffer) {
        try {
            const frame = decode(data);
            if (frame.type === AUTH_REQ) {
                this.handleAuth(frame);
            } else if (frame.type === AUTH_RES) {
                this.authDefer.resolve(frame.message || 'tunnel auth success');
            } else if (frame.type === TUNNEL_REQ) {
                this.handleTunnelReq(frame);
            } else if (frame.type === TUNNEL_RES) {
                this.prepareDefer.resolve(frame.message || 'tunnel prepare success');
            } else if (frame.type === PING_FRAME) {
                const pongFrame = { type: PONG_FRAME, stime: frame.stime, atime: Date.now() };
                this.sendFrame(pongFrame);
            } else if (frame.type === PONG_FRAME) {
                this.emit('pong', { stime: frame.stime, atime: frame.atime });
            } else {
                this.dispatchFrame(frame); // stream frame
            }
        } catch (error) {
            console.log('error:', error);
        }
    }
    dispatchFrame(frame: Frame) {
        // console.log('dispatchFrame:', frame);
        const self = this;
        const streamId = frame.streamId || '';
        if (frame.type === STREAM_INIT) {
            // client init stream
            const stream = new GankStream(streamId, function (data: Buffer) {
                const dataFrame = { type: STREAM_DATA, streamId, data };
                self.sendStreamFrame(dataFrame);
            });

            stream.id = streamId;
            this.emitStreamEvent(stream);
        } else if (frame.type === STREAM_EST) {
            // server check est stream
            const defer = this.defers[streamId];
            const stream = this.streams[streamId];
            if (stream) {
                defer.resolve(stream);
                delete this.defers[streamId];
                this.emitStreamEvent(stream);
            } else {
                this.resetStream(streamId, 'missing stream!' + STREAM_EST);
            }
        } else if (frame.type === STREAM_DATA) {
            const stream = this.streams[streamId];
            if (stream) {
                stream.produce(frame.data);
            } else {
                this.resetStream(streamId, 'missing stream!' + STREAM_DATA);
            }
        } else if (frame.type === STREAM_FIN) {
            const stream = this.streams[streamId];
            // console.log('close stream');
            if (stream) {
                stream.destroy();
                delete this.streams[streamId];
            }
        } else if (frame.type === STREAM_RST) {
            // console.log('destory stream');
            const stream = this.streams[streamId];
            if (stream) {
                stream.destroy();
                delete this.streams[streamId];
                if (!stream.isReady) {
                    const defer = this.defers[streamId];
                    const msg = frame.data?.toString();
                    // console.log('msg:',msg);
                    defer.reject(msg);
                }
            }
        }
    }

    startAuth(token: string) {
        let authReqFm = { type: AUTH_REQ, status: 0, token };
        this.sendFrame(authReqFm);
        setTimeout(() => this.authDefer.reject(Error('timeout')), 5 * 1000);
        return this.authDefer;
    }

    prepareTunnel(tunopts: TunnelOpts) {
        let port = tunopts.tunType === 0x2 ? 0 : tunopts.remotePort;
        let subdomain = tunopts.tunType === 0x2 ? tunopts.subdomain : '';
        let secretKey = tunopts.secretKey;
        if (tunopts.bindIp && tunopts.bindPort) {
            secretKey = 'stcp_right_' + secretKey;
        } else {
            secretKey = 'stcp_left_' + secretKey;
        }
        const tunnelreqFrame = { type: TUNNEL_REQ, tunType: tunopts.tunType, name: tunopts.name, port, subdomain, secretKey };
        this.sendFrame(tunnelreqFrame);
        setTimeout(() => this.prepareDefer.reject(Error('timeout')), 5 * 1000);
        return this.prepareDefer;
    }

    createStream(): Promise<any> {
        const self = this;
        const defer: Deferred<GankStream> = deferred();
        const streamId = getRamdomUUID();
        this.defers[streamId] = defer;
        try {
            const initFrame = { type: STREAM_INIT, streamId };
            this.sendFrame(initFrame);
            const stream = new GankStream(streamId, function (data: Buffer) {
                const dataFrame = { type: STREAM_DATA, streamId, data };
                self.sendFrame(dataFrame);
            });
            this.streams[streamId] = stream;
            // console.log('createStream:tid:', this.id, ' sid:', streamId);
        } catch (error) {
            defer.reject(error);
        }
        return defer;
    }

    setReady(stream: GankStream) {
        this.streams[stream.id] = stream;
        const estFrame = { type: STREAM_EST, streamId: stream.id };
        this.sendFrame(estFrame);
    }
    ping() {
        this.sendFrame({ type: PING_FRAME, stime: Date.now() });
    }
}
