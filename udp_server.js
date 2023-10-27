var dgram = require('dgram'),
    port = 5555,
    clients = [];

var server = dgram.createSocket('udp4', function(data, rinfo) {
    console.log('data:', data.toString(), rinfo);
    clients.push(rinfo);
    // console.log(clients);
    //sending msg
    server.send('hello client'+Math.random().toString(36), rinfo.port, rinfo.address, function(error) {
        if (error) {
            client.close();
        } else {
            // console.log('Data sent !!!');
        }
    });
});

server.bind(port, function() {
    console.log('Serveur démarré sur le port %d.', port);
});
