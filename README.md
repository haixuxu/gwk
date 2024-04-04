# gwk

Gwk is a tool that helps you expose your local servers or services to the
internet, even in a private network. 

# wiki

[Wiki](https://github.com/xuxihai123/gwk/wiki)

# Feature

- support tcp port expose
- support subdomain expose http server
- support udp port expose 
- support stcp expose with two peer

# install

```bash
npm install -g gwk
```

# usage

serverHost default is `gank.75cos.com`

```bash
# example 1 , detault dispatch to 127.0.0.1:8080
gwk
```

# client more  example

```bash
# example 2
gwk  --port 8080
# example 3
gwk  --subdomain testabc001 --port 8000
# example 4
gwk  -c client.json
```

client.json

```json
{
  "serverHost": "gank007.com",
  "serverPort": 4443,
  "tunnels": {
    "tcp001": {
      "protocol": "tcp",
      "localPort": 5000,
      "remotePort": 7200
    },
    "tcp002": {
      "protocol": "tcp",
      "localPort": 5000,
      "remotePort": 7500
    },
    "webapp02": {
      "protocol": "web",
      "localPort": 4900,
      "subdomain": "app02"
    },
    "webappmob": {
      "protocol": "web",
      "localPort": 9000,
      "subdomain": "mob"
    }
  }
}
```

# setup a gwk server

```bash
gwkd  -c server.json
# start with pm2
pm2 start gwkd --name gwkapp --  -c server.json
```

server.json

```json
{
  "serverHost": "gwk007.com",
  "serverPort": 4443,
  "httpAddr": 80,
  "httpsAddr": 443,
  "tlsCA": "./rootCA/rootCA.crt",
  "tlsCrt": "./cert/my.crt",
  "tlsKey": "./cert/my.key.pem"
}
```


#  develop

generate CA 

```bash
node scripts/createRootCA.js
```
generate cert

```bash
node scripts/createRootByCA.js
```

start server

```bash
export GWK_SERVER=true
npx tsx src/cli.ts -c etc/server.json
```

start client

```bash
npx tsx src/cli.ts -c etc/client.json
```

# test dns with custom port

```bash
dig @127.0.0.1 -p 6666 bbs.75cos.com
```
