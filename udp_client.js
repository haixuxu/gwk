var dgram = require('dgram'),
    server = {
        host: 'localhost',
        port: 6666,
    };

var client = dgram.createSocket('udp4', function(message, rinfo) {
    console.log('from server %s', message.toString(), rinfo);
});

client.bind(); // bind random udp port

setInterval(() => {
    client.send('hello'+Date.now(), server.port, server.host, function(err, bytes) {
        if(err){
            console.log('err:', err, 'bytes:', bytes);
        }
    });
}, 2000);
