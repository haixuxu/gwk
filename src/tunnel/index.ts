import net from 'net';
import GankStream from './stream';
import { getRamdomUUID } from '../utils/uuid';
import { createDeferred } from '../utils/defered';
import { STREAM_DATA, STREAM_EST, STREAM_FIN, STREAM_INIT, STREAM_RST, StreamFrame } from '../protocol';
import { tcpsocketSend } from '../utils/socket';
import EventEmitter from 'events';
import { TunnelOpts } from '../types';
import { frameSegment } from '../protocol/segment';

export class Tunnel extends EventEmitter {
    id: string;
    socket: net.Socket;
    defers: any;
    streams: Record<string, GankStream>;
    opts: TunnelOpts;
    constructor(tid: string, socket: net.Socket, opts: TunnelOpts) {
        super();
        this.id = tid;
        this.socket = socket;
        this.opts = opts;
        this.defers = {};
        this.streams = {};
    }

    resetStream(streamId: string) {
        const rstFrame = new StreamFrame(STREAM_RST, this.id, streamId);
        tcpsocketSend(this.socket, rstFrame.encode());
    }
    bindClose(stream: GankStream) {
        const self = this;
        stream.on('close', function() {
            const finFrame = new StreamFrame(STREAM_FIN, self.id, stream.id);
            try {
                tcpsocketSend(self.socket, finFrame.encode());
            } catch (error) {
                // ignor
                console.log('error:',error);
            }
        });
    }
    dispatchFrame(frame: StreamFrame) {
        // console.log('dispatchFrame:', frame);
        const self = this;
        if (frame.type === STREAM_INIT) {
            // client init stream
            const streamId = frame.streamId;
            const stream = new GankStream(function(data: Buffer) {
                const dataFrame = new StreamFrame(STREAM_DATA, self.id, streamId, data);
                const listFrames = frameSegment(dataFrame);
                console.log('write to socket for streamId:', streamId);
                listFrames.forEach((temp) => {
                    tcpsocketSend(self.socket, temp.encode());
                });
            });

            stream.id = streamId;
            self.bindClose(stream);
            self.emit('stream', stream);
        } else if (frame.type === STREAM_EST) {
            // server check est stream
            const defer = this.defers[frame.streamId];
            const streamId = frame.streamId;
            const stream = new GankStream(function(data: Buffer) {
                const dataFrame = new StreamFrame(STREAM_DATA, self.id, streamId, data);
                const listFrames = frameSegment(dataFrame);
                listFrames.forEach((temp) => {
                    tcpsocketSend(self.socket, temp.encode());
                });
            });
            stream.id = streamId;
            this.streams[streamId] = stream;
            defer.resolve(stream);
            delete self.defers[streamId];
            self.bindClose(stream);
        } else if (frame.type === STREAM_DATA) {
            const stream = self.streams[frame.streamId];
            if (stream) {
                console.log('produce data ok..', stream.id);
                stream.produce(frame.data);
            } else {
                self.resetStream(frame.streamId);
                return;
            }
        } else if (frame.type === STREAM_FIN) {
            const stream = self.streams[frame.streamId];
            console.log('close stream');
            if (stream) {
                stream.destroy();
                delete this.streams[frame.streamId];
            }
        } else if (frame.type === STREAM_RST) {
            console.log('destory stream');
            const stream = self.streams[frame.streamId];
            if (stream) {
                stream.destroy();
                delete this.streams[frame.streamId];
            }
        }
    }

    createStream(): Promise<any> {
        const defer:any = createDeferred();
        const streamId = getRamdomUUID();
        this.defers[streamId] = defer;
        try {
            const initFrame = new StreamFrame(STREAM_INIT, this.id, streamId);
            tcpsocketSend(this.socket, initFrame.encode());
            console.log('createStream:tid:', this.id, ' sid:', streamId);
        } catch (error) {
            defer.reject(error);
        }
        return defer.promise;
    }

    setReady(stream: GankStream) {
        this.streams[stream.id] = stream;
        const estFrame = new StreamFrame(STREAM_EST, this.id, stream.id);
        console.log('setReady:tid:', this.id, ' sid:', stream.id);
        tcpsocketSend(this.socket, estFrame.encode());
    }
}
