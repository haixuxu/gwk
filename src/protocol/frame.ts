export interface Frame {
    type: number;
    token?: string;
    status?: number;
    stime?: number;
    atime?: number;
    tunType?: number;
    port?: number;
    subdomain?: string;
    name?: string;
    message?: string;
    secretKey?: string;
    streamId?: string;
    data?: Buffer;
}
