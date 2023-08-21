export interface Frame {
    type: number;
    token?: string;
    status?: number;
    stime?: number;
    atime?: number;
    protocol?: number;
    port?: number;
    subdomain?: string;
    name?: string;
    message?: string;
    streamId?: string;
    data?: Buffer;
}
