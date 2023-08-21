import net from 'net';
import { GankClientOpts, TunnelOpts } from './types/index';
import { Tunnel } from './tunnel';
import getCustomLogger, { Logger } from './utils/logger';
import chalk from 'chalk';
import printer from './utils/printer';
// import { stringifyExclude } from './utils/replacer';

class Client {
    serverHost: string;
    serverPort: number;
    tunnelsMap: Record<string, TunnelOpts>;
    logger: Logger;
    constructor(opts: GankClientOpts) {
        this.serverHost = opts.tunnelHost;
        this.serverPort = opts.tunnelAddr || 4443;
        this.tunnelsMap = opts.tunnels || {};
        this.logger = getCustomLogger('c>', 'debug');
    }

    handleStream(tunnel: Tunnel, stream: any) {
        const tunnelConf = tunnel.opts as TunnelOpts;
        const successMsg = (tunnel as any).successMsg;
        // this.logger.info('new stream==== for tunnel:', tunnel.id, JSON.stringify(tunnel.opts));
        const localPort = tunnelConf.localPort;
        tunnelConf.status = `${successMsg} ${chalk.green('->')}`;

        const localsocket = new net.Socket();
        let aborted = false;
        // this.logger.info('connect 127.0.0.1:' + localPort);
        localsocket.connect(localPort, '127.0.0.1', () => {
            if (aborted) return;
            clearTimeout(timeoutid);
            // this.logger.info('connect ok:', localPort);
            tunnelConf.status = `${successMsg} ${chalk.green('<->')}`;
            stream.pipe(localsocket);
            localsocket.pipe(stream);
            tunnel.setReady(stream);
        });
        localsocket.on('close', () => {
            tunnelConf.status = successMsg;
            stream.destroy();
        });
        localsocket.on('error', (err) => stream.destroy(err));
        stream.on('close', () => localsocket.destroy());

        var timeoutid = setTimeout(() => {
            aborted = true;
            tunnelConf.status = `${successMsg} ${chalk.yellow('timeout to'+localPort)}`;
            localsocket.emit('error', Error('socket connect timeout!'));
        }, 15 * 1000);
    }
    setupTunnel(tunnelConf: TunnelOpts) {
        const targetSocket = new net.Socket();
        // this.logger.info('creating tunnel:', name);
        // this.logger.info(`connecting ${this.serverHost}:${this.serverPort}`);
        tunnelConf.status = 'connecting';
        targetSocket.connect(this.serverPort, this.serverHost, () => {
            // this.logger.info('connect okok');
            tunnelConf.status = 'connect ok, starting auth';
            const tunnel = new Tunnel(targetSocket, tunnelConf);
            tunnel.on('stream', this.handleStream.bind(this, tunnel));
            tunnel.on('authed', (message: string) => {
                tunnelConf.status = 'auth ==>' + message;
            });
            tunnel.on('prepared', (message: string) => {
                const successMsg = `tunnel ${chalk.green('ok')}: ${message} => tcp://127.0.0.1:${tunnelConf.localPort}`;
                tunnelConf.status = successMsg;
                (tunnel as any).successMsg = successMsg;
            });
            tunnel.on('error', (err: Error) => {
                tunnelConf.status = `tunnel ${chalk.red('err')}:${err.message}`;
            });
            tunnel.startAuth("test:test124")
        });
        targetSocket.on('error', (err: Error) => {
            tunnelConf.status = 'err:' + err.message;
            // this.logger.error('connect err:', err.message, ' retrying');
        });
        targetSocket.on('close', () => {
            // this.logger.error('server is closed.');
            setTimeout(() => this.setupTunnel(tunnelConf), 3000);
        });
    }

    showConsole() {
        const keys = Object.keys(this.tunnelsMap);
        let message = 'tunnel list:\n';
        keys.forEach((key: string) => {
            const tunnelConf = this.tunnelsMap[key];
            message += tunnelConf.name?.padEnd(16) + '';
            message += tunnelConf.status + '\n';
        });
        // console.log('tunnel===\n'+message);
        printer.printStatus(message);
    }

    bootstrap() {
        const self = this;
        Object.entries(this.tunnelsMap || {}).forEach(function(values: any) {
            values[1].name = values[0];
            values[1].status = ' starting tunnel ' + values[0];
        });

        Object.keys(this.tunnelsMap).forEach((key: string) => {
            const tunnelConf = this.tunnelsMap[key];
            const proxyConf = new Proxy(tunnelConf, {
                get: function(target: any, prop) {
                    return target[prop];
                },
                set: function(target: any, prop, value: any) {
                    target[prop] = value;
                    if (prop === 'status') {
                        self.showConsole();
                    }
                    return true;
                },
            });
            return this.setupTunnel(proxyConf);
        });
    }
}

export default Client;
