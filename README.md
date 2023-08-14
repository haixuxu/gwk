# gank

Gank is a tool that helps you expose your local servers or services to the
internet, even in a private network. It supports both TCP and subdomain modes.

In TCP mode, Gank creates a secure tunnel between your local machine and the
Gank server, allowing external access to your locally hosted services by
forwarding incoming traffic from a specific port on the Gank server to a
designated port on your local machine.

In subdomain mode, Gank allows you to assign custom subdomains to your local
services. This means you can access your services using easy-to-remember URLs
like `service.example.com` instead of using IP addresses and port numbers.

Overall, Gank simplifies the process of exposing your local services to the
internet, making it easier to showcase your projects or collaborate with others
remotely.

# install

```bash
npm install -g gankcli
```

# server

```bash
gank server -c server.json
# start with pm2
pm2 start gank --name gankapp -- server -c server.json
```

server.json

```json
{
  "serverHost": "gank007.com", // 使用web 隧道时, 需要域名
  "tunnelAddr": 4443, // 隧道监听端口
  "httpAddr": 80, // 启动http服务
  "httpsAddr": 443, // 启动https服务, 需要后面的证书配置
  "tlsCA": "./rootCA/rootCA.crt", // 使用自签名证书用到
  "tlsCrt": "./cert/my.crt",
  "tlsKey": "./cert/my.key.pem"
}
```

# client

```bash
# example 1 
gank client
# example 2
gank client --port 8080
# example 3
gank client --subdomain testabc001 --port 8000
# example 4
gank client -c client.json
```

client.json

```json
{
  "tunnelHost": "gank007.com", // 服务器地址
  "tunnelAddr": 4443, // 服务器端口
  "tunnels": [
    {
      "protocol": "tcp",
      "localPort": 5000,
      "remotePort": 7200
    },
    {
      "protocol": "tcp",
      "localPort": 5000,
      "remotePort": 9000
    },
    {
      "protocol": "web",
      "localPort": 4900,
      "subdomain": "app02"
    },
    {
      "protocol": "web",
      "localPort": 9000,
      "subdomain": "mob"
    }
  ]
}
```
