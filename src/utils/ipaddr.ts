import { IpAddr } from '../types';

export function buildIpAddrBuffer(addr: string, port: number): Buffer {
    const ipints = addr.split('.').map((p) => parseInt(p));
    ipints.push(port >> 8, port % 256);
    const buff = Buffer.from(ipints);
    return buff;
}

export function parseIpAddrBuffer(buff: Buffer): IpAddr {
    const address = `${buff[0]}.${buff[1]}.${buff[2]}.${buff[3]}`;
    const port = (buff[4] << 8) + buff[5];
    return { addr: address, port };
}
