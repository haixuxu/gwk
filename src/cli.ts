import commander from 'commander';
import fs from 'fs';
import path from 'path';
import Client from './Client';
import Server from './Server';

const pkgObj = readJsonFile(path.resolve(__dirname, '../package.json'));
commander.version(pkgObj.version).description('gank for portmap');

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
    .description('Starts the gank server')
    .option('-c, --config <path>', 'Path to the server configuration file')
    .action((cmd: any) => {
        const configPath = cmd.config || 'server.json';
        console.log(`Starting gank server with config: ${configPath}`);
        const serverOpts = readJsonFile(configPath);
        const server = new Server(serverOpts);
        server.bootstrap();
    });

commander
    .command('client')
    .description('Starts the gank client')
    .option('-c, --config <path>', 'Path to the client configuration file')
    .action((cmd: any) => {
        const configPath = cmd.config || 'client.json';
        console.log(`Starting gank client with config: ${configPath}`);
        const clientOpts = readJsonFile(configPath);
        const client = new Client(clientOpts);
        client.bootstrap();
    });

commander.parse(process.argv);

if (!process.argv.slice(2).length) {
    commander.outputHelp();
}
