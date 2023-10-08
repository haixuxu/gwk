import { Tunnel } from "../tunnel";

export interface TunnelOpts {
    name?:string;
    protocol: string; // tcp/web
    localPort: number;
    subdomain?: string; // http only
    remotePort?: number;
    fulldomain?:string;
    status?:string;
}

export interface GankClientOpts {
    authtoken: string; // for client auth
    serverPort?: number; // for tcp connect remote server
    serverHost: string; // for tcp connect remote server
    logLevel: string;
    logFile: string;
    tunnels: Record<string,TunnelOpts>;
}

export interface GankServerOpts {
    serverHost?: string; // default  gank007.com
    httpAddr?: number; // default 80
    httpsAddr?: number; // default 443
    logLevel?: string; // default info
    logFile?: string; // log file
    tlsCA?: string;
    tlsCrt?: string;
    tlsKey?: string;
    serverPort?: number;
}


export interface ConnectObj {
    tunnel:Tunnel;
    socket: any;
    rtt: number;
    url:string;
    type?:string;
    name?:string;
    fulldomain?:string;
    remotePort?:number;
    server?:any;
}