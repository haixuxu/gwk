export interface TunnelOpts {
    protocol: string; // tcp/web
    localPort: number;
    subdomain?: string; // http only
    remotePort?: number;
    fulldomain?:string;
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
    tlsCA?: string;
    tlsCrt?: string;
    tlsKey?: string;
    tunnelAddr?: number;
}
