import commander from 'commander';
import fs, { readFileSync } from 'fs';
import path from 'path';
import Client from './Client';
import Server from './Server';
import { genSubdomain } from './utils/subdomain';
import { TunnelOpts } from './types';

const pkgObj = readJsonFile(path.resolve(__dirname, '../package.json'));
commander.version(pkgObj.version).description('gwk for portmap');

function readJsonFile(filepath: string): any {
    try {
        if (path.isAbsolute(filepath) === false) {
            filepath = path.resolve(process.cwd(), filepath);
        }
        const jsonfileContent = fs.readFileSync(filepath, 'utf8');
        return JSON.parse(jsonfileContent);
    } catch (err) {
        throw err;
    }
}

commander
    .command('server')
    .description('Starts the gwk server')
    .option('-c, --config <path>', 'Path to the server configuration file')
    .action((cmd: any) => {
        const configPath = cmd.config || 'server.json';
        console.log(`Starting gwk server with config: ${configPath}`);
        const serverOpts = readJsonFile(configPath);
        if (serverOpts.tlsCrt) {
            serverOpts.tlsCrt = fs.readFileSync(path.resolve(process.cwd(), serverOpts.tlsCrt), 'utf8');
            serverOpts.tlsKey = fs.readFileSync(path.resolve(process.cwd(), serverOpts.tlsKey), 'utf8');
        }
        if (serverOpts.tlsCA) {
            serverOpts.tlsCA = fs.readFileSync(path.resolve(process.cwd(), serverOpts.tlsCA), 'utf8');
        }
        const server = new Server(serverOpts);

        server.bootstrap();
    });

commander
    .command('client')
    .description('Starts the gwk client')
    .option('-c, --config <path>', 'Path to the client configuration file')
    .option('-p, --port <port>', 'set web tunnel local port')
    .option('-s, --subdomain <subdomain>', 'set web tunnel subdomain')
    .action((cmd: any) => {
        const configPath = cmd.config;
        let clientOpts: any = {};
        if (configPath) {
            console.log(`Starting gwk client with config: ${configPath}`);
            clientOpts = readJsonFile(configPath);
        } else {
            const subdomain = cmd.subdomain || genSubdomain();
            const tunnelItem: TunnelOpts = { protocol: 'web', subdomain, localPort: cmd.port || 8080 };
            clientOpts.tunnels = { unnamed: tunnelItem };
        }

        if (!clientOpts.tunnelHost) {
            clientOpts.tunnelHost = 'gank.75cos.com';
            clientOpts.tunnelAddr = 4443;
        }
        const client = new Client(clientOpts);
        client.bootstrap();
    });

commander.parse(process.argv);

if (!process.argv.slice(2).length) {
    commander.outputHelp();
}
