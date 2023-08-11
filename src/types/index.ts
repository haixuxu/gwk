export interface TunnelOpts {
    protocol: string; // tcp/http/https
    subdomain: string; // http only
    localPort: number;
    remotePort: number;
}

export interface GankClientOpts {
    authtoken: string; // for client auth
    tunnelAddr?: number; // for tcp connect remote server
    tunnelHost: string; // for tcp connect remote server
    logLevel: string;
    logFile: string;
    tunnels: Array<TunnelOpts>;
}

export interface GankServerOpts {
    domain?: string; // default  gank.com
    httpAddr?: number; // default 80
    httpsAddr?: number; // default 443
    logLevel?: string; // default info
    logFile?: string; // log file
    tlsCrt?: string;
    tlsKey?: string;
    tunnelAddr?: number;
}
