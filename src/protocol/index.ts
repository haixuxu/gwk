import { AUTH_REQ, AUTH_RES, AuthFrame, PING_FRAME, PONG_FRAME, PingFrame, PongFrame, STREAM_INIT, StreamFrame, TUNNEL_REQ, TUNNEL_RES, TunnelReqFrame, TunnelResFrame } from './frame';

export * from './frame';

/**
 * // required: type, token
 * @param {*} AUTH_REQ frame
 * |<--type[1]-->|--status(1)--|<------auth token(32)------>|
 * |-----s1 -----|------0------|--------------s2------------|
 *
 * @param {*} AUTH_RES frame
 * |<--type[1]-->|--status(1)--|<------auth token(32)------>|
 * |-----s1 -----|-----1/2-----|--------------s2------------|
 *
 * @param {*} PING frame
 * |<--type[1]-->|----stime---|
 * |-----s1 -----|------13------|
 * @param {*} PONG frame
 * |<--type[1]-->|----stime---|-----atime-----|
 * |-----s1 -----|---- 13-----|-----13--------|
 *
 * @param {*} TUNNEL_REQ frame
 * |<--type[1]-->|----tunnel id ---|----pro----|----port/subdomain----|
 * |-----s1 -----|-------32--------|----- 1----|-------port-----------|
 * |-----s1 -----|-------32--------|----- 1----|--1--|----domain------|
 *
 * @param {*} TUNNEL_RES frame
 * |<--type[1]-->|----tunnel id ---|----status----|
 * |-----s1 -----|-------32--------|----- 1-------|
 *
 * @param {*} STREAM_INIT frame
 * |<--type[1]-->|----tunnel id ---|----stream id----|
 * |-----s1 -----|-------32--------|------- 32-------|
 * @param {*} STREAM_EST frame
 * |<--type[1]-->|----tunnel id ---|----stream id----|
 * |-----s1 -----|-------32--------|------- 32-------|
 *
 * @param {*} STREAM_DATA frame
 * |<--type[1]-->|----tunnel id ---|----stream id----|-------data--------|
 * |-----s1 -----|-------32--------|------- 32-------|-------------------|
 *
 * @param {*} STREAM_RST frame
 * |<--type[1]-->|----tunnel id ---|----stream id----|
 * |-----s1 -----|-------32--------|------- 32-------|
 *
 *  * @param {*} STREAM_FIN frame
 * |<--type[1]-->|----tunnel id ---|----stream id----|
 * |-----s1 -----|-------32--------|------- 32-------|
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
        const tunnelId = data.slice(1, 33).toString();
        const prototype = data[33];
        let value: any;
        if (prototype === 0x1) {
            value = data[34] * 256 + data[35];
        } else {
            value = data.slice(34, data[34]);
        }
        return new TunnelReqFrame(type, tunnelId, data[33], value);
    } else if (type === TUNNEL_RES) {
        const tunnelId = data.slice(1, 33).toString();
        const status = data[33];
        return new TunnelResFrame(type, tunnelId, status);
    } else {
        const tunnelId = data.slice(1, 33).toString();
        const streamId = data.slice(33, 65).toString();
        const dataBuf = data.slice(65);
        return new StreamFrame(type, tunnelId, streamId, dataBuf);
    }
}
