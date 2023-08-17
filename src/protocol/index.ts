import { AUTH_REQ, AUTH_RES, AuthFrame, PING_FRAME, PONG_FRAME, PingFrame, PongFrame, STREAM_INIT, StreamFrame, TUNNEL_REQ, TUNNEL_RES, TunnelReqFrame, TunnelResFrame } from './frame';

export * from './frame';

/**
 * // required: type, token
 * @param {*} AUTH_REQ frame
 * |<--type[1]-->|--status(1)--|<------auth token(32)------>|
 * |----- 1 -----|------0------|--------------s2------------|
 *
 * @param {*} AUTH_RES frame
 * |<--type[1]-->|--status(1)--|<------auth token(32)------>|
 * |----- 1 -----|-----1/2-----|--------------s2------------|
 *
 * @param {*} PING frame
 * |<--type[1]-->|----stime---|
 * |----- 1 -----|------13------|
 * @param {*} PONG frame
 * |<--type[1]-->|----stime---|-----atime-----|
 * |----- 1 -----|---- 13-----|-----13--------|
 *
 * @param {*} TUNNEL_REQ frame
 * |<--type[1]-->|----pro----|----port/subdomain----|
 * |----- 1 -----|----- 1----|---1---|--------name:port--------|
 * |----- 1 -----|----- 1----|---1---|--------name:domain------|
 *
 * @param {*} TUNNEL_RES frame
 * |<--type[1]-->|----status----|-message(2)|------message-------|
 * |----- 1 -----|----- 1-------|-----2-----|--------------------|
 *
 * @param {*} STREAM_INIT frame
 * |<--type[1]-->|----stream id----|
 * |-----1 -----|------- 16-------|
 * @param {*} STREAM_EST frame
 * |<--type[1]-->|----stream id----|
 * |-----1 -----|------- 16-------|
 *
 * @param {*} STREAM_DATA frame
 * |<--type[1]-->|----stream id----|-------data--------|
 * |-----1 -----|------- 16-------|-------------------|
 *
 * @param {*} STREAM_RST frame
 * |<--type[1]-->|----stream id----|
 * |-----1 -----|------- 16-------|
 *
 * @param {*} STREAM_FIN frame
 * |<--type[1]-->|----stream id----|
 * |-----1 -----|------- 16-------|
 * @returns
 */

export function decode(data: Buffer): any {
    const type = data[0];
    if (type === AUTH_REQ) {
        const token = data.slice(2, 34);
        return new AuthFrame(type, token.toString(), 0);
    } else if (type === AUTH_RES) {
        const token = data.slice(2, 34);
        return new AuthFrame(type, token.toString(), data[1]);
    } else if (type === PING_FRAME) {
        const stime = data.slice(1, 14).toString();
        return new PingFrame(type, stime);
    } else if (type === PONG_FRAME) {
        const stime = data.slice(1, 14).toString();
        const atime = data.slice(14, 27).toString();
        return new PongFrame(type, stime, atime);
    } else if (type === TUNNEL_REQ) {
        const proto = data[1];
        let message = data.slice(3, 3 + data[2]).toString();
        let parts = message.split(':');
        let port = 0;
        let subdomain = '';
        if (proto === 0x1) {
            port = Number(parts[1]);
        } else {
            subdomain = parts[1];
        }
        return new TunnelReqFrame(type, proto, parts[0], port, subdomain);
    } else if (type === TUNNEL_RES) {
        const status = data[1];
        const datalen = data[2] * 256 + data[3];
        const message2 = data.slice(4, 4 + datalen).toString();
        return new TunnelResFrame(type, status, message2);
    } else {
        const streamId = data.slice(1, 17).toString('hex');
        const dataBuf = data.slice(17);
        return new StreamFrame(type, streamId, dataBuf);
    }
}
