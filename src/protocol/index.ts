import { Frame } from './frame';
export * from './frame';

export const AUTH_REQ = 0x0; // start auth
export const AUTH_RES = 0x1; // auth response

export const TUNNEL_REQ = 0xa6; // start tunnel
export const TUNNEL_RES = 0xa9; // response tunnel

// ping pong
export const PING_FRAME = 0x6;
export const PONG_FRAME = 0x9;

// stream
export const STREAM_INIT = 0xf0;
export const STREAM_EST = 0xf1;
export const STREAM_DATA = 0xf2;
export const STREAM_FIN = 0xf3;
export const STREAM_RST = 0xf4;

/**
 * // required: type, token
 * @param {*} AUTH_REQ frame
 * |<--type[1]-->|--status(1)--|<------auth token------>|
 * |----- 1 -----|------0------|----------s2------------|
 *
 * @param {*} AUTH_RES frame
 * |<--type[1]-->|--status(1)--|<--------message------->|
 * |----- 1 -----|-----1/2-----|----------s2------------|
 *
 * @param {*} PING frame
 * |<--type[1]-->|----stime--|
 * |----- 1 -----|-----8-----|
 * @param {*} PONG frame
 * |<--type[1]-->|----stime--|----atime----|
 * |----- 1 -----|-----8-----|-----8-------|
 *
 * @param {*} TUNNEL_REQ frame
 * |<--type[1]-->|----pro----|----- port/subdomain-----|
 * |----- 1 -----|----- 1----|--------name:port--------|
 * |----- 1 -----|----- 1----|--------name:domain------|
 *
 * @param {*} TUNNEL_RES frame
 * |<--type[1]-->|----status----|------message-------|
 * |----- 1 -----|----- 1-------|--------------------|
 *
 * @param {*} STREAM_INIT frame
 * |<--type[1]-->|----stream id----|
 * |----- 1 -----|------- 16-------|
 * @param {*} STREAM_EST frame
 * |<--type[1]-->|----stream id----|
 * |----- 1 -----|------- 16-------|
 *
 * @param {*} STREAM_DATA frame
 * |<--type[1]-->|----stream id----|-------data--------|
 * |----- 1 -----|------- 16-------|-------------------|
 *
 * @param {*} STREAM_RST frame
 * |<--type[1]-->|----stream id----|
 * |----- 1 -----|------- 16-------|------message------|
 *
 * @param {*} STREAM_FIN frame
 * |<--type[1]-->|----stream id----|
 * |----- 1 -----|------- 16-------|
 * @returns
 */

export function encode(frame: Frame): Buffer {
    const type = frame.type;
    const prefix = Buffer.from([type]);
    if (type === AUTH_REQ) {
        const statusBuf = Buffer.from([frame.status as number]);
        return Buffer.concat([prefix, statusBuf, Buffer.from(frame.token as string)]);
    } else if (type === AUTH_RES) {
        const statusBuf = Buffer.from([frame.status as number]);
        return Buffer.concat([prefix, statusBuf, Buffer.from(frame.message as string)]);
    } else if (type === PING_FRAME) {
        return Buffer.concat([prefix, timestampToBytes(frame.stime as number)]);
    } else if (type === PONG_FRAME) {
        return Buffer.concat([prefix, timestampToBytes(frame.stime as number), timestampToBytes(frame.atime as number)]);
    } else if (type === TUNNEL_REQ) {
        const probuf = Buffer.from([frame.tunType as number]);
        let message = '';
        if (frame.tunType === 0x2) {
            message = `${frame.name}:${frame.subdomain}`;
        } else if (frame.tunType === 0x1 || frame.tunType === 0x3) {
            // 0x1:tcp, 0x3:udp
            message = `${frame.name}:${frame.port}`;
        } else if (frame.tunType === 0x4) {
            message = `${frame.name}:${frame.secretKey}`;
        }
        console.log('message;',message);
        return Buffer.concat([prefix, probuf, Buffer.from(message)]);
    } else if (type === TUNNEL_RES) {
        const statusBuf = Buffer.from([frame.status as number]);
        const messageBuf = Buffer.from(frame.message as string);
        return Buffer.concat([prefix, statusBuf, messageBuf]);
    } else {
        // stream frame
        const buf = Buffer.concat([prefix, Buffer.from(frame.streamId as string, 'hex')]);
        if (!frame.data) {
            return buf;
        } else {
            return Buffer.concat([buf, frame.data]);
        }
    }
}

export function decode(data: Buffer): Frame {
    const type = data[0];
    if (type === AUTH_REQ) {
        const token = data.slice(2);
        return { type, token: token.toString(), status: 0 };
    } else if (type === AUTH_RES) {
        const message = data.slice(2).toString();
        return { type, message, status: data[1] };
    } else if (type === PING_FRAME) {
        const stime = bytesToTimestamp(data.slice(1, 9));
        return { type, stime };
    } else if (type === PONG_FRAME) {
        const stime = bytesToTimestamp(data.slice(1, 9));
        const atime = bytesToTimestamp(data.slice(9, 17));
        return { type, stime, atime };
    } else if (type === TUNNEL_REQ) {
        const proto = data[1];
        let message = data.slice(2).toString();
        let parts = message.split(':');
        let port = 0;
        let subdomain = '';
        let secretKey = '';
        if (proto === 0x1 || proto === 0x3) {
            port = Number(parts[1]);
        } else if (proto === 0x2) {
            subdomain = parts[1];
        } else if (proto === 0x4) {
            secretKey = parts[1];
        }
        return { type, tunType: proto, name: parts[0], port, subdomain, secretKey };
    } else if (type === TUNNEL_RES) {
        const status = data[1];
        const message = data.slice(2).toString();
        return { type, status, message };
    } else {
        const streamId = data.slice(1, 17).toString('hex');
        const dataBuf = data.slice(17);
        return { type, streamId, data: dataBuf };
    }
}

function timestampToBytes(time: number) {
    const timestrap = BigInt(time);
    const buffer = Buffer.alloc(8); // 创建一个8字节的Buffer
    // 将时间戳写入Buffer
    buffer.writeBigUInt64BE(timestrap);
    return buffer;
}

function bytesToTimestamp(buf: Buffer) {
    return Number(buf.readBigUInt64BE());
}
