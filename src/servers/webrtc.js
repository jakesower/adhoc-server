/**
  A simple webrtc signalling server. It works similarly to:
  https://www.tutorialspoint.com/webrtc/webrtc_signaling.htm

  Typical connection workflow:

  - A connects to server
  - Server tells A it is alone in room
  - B connects to server
  - Server tells B that A is the only one in the room
  - Server tells A that B has connected
  - B sends offer to A via server
  - A sends answer to B via server
  - B sends ICE candidate to A via server
  - A sends ICE candidate to B via server
*/

module.exports = function (server) {
  var WebSocketServer = require('ws').Server;
  var wss = new WebSocketServer({ server: server });

  var channels = {};
  var awaitingConnection = [];

  function addConnectionToChannel(connection, channelID) {
    if (!channels[channelID]) {
      channels[channelID] = [];
    }

    var channel = channels[channelID];

    console.log('id ' + connection.id + ' connected to channel ' + channelID);
    channel.push(connection);

    broadcastTo(channel, {
      type: 'peers',
      peers: channel.filter(c => c.id !== connection.id).map(c => c.id)
    }, connection.id);

    broadcastAll(channel, {
      type: 'peerConnected',
      id: connection.id
    }, connection.id);

    return channel;
  }

  function removeConnectionFromChannel(connection, channelID) {
    if (channels[channelID]) {
      console.log('id ' + connection.id + ' disconnected from channel ' + channelID);
      channels[channelID] = channels[channelID].filter(c => c !== connection);

      broadcastAll(channels[channelID], {
        type: 'peerDisconnected',
        id: connection.id
      });

      if (channels[channelID].length === 0) {
        delete channels[channelID];
      }
    }
    else {
      console.log('id ' + connection.id + ' TRIED disconnecting from channel ' + channelID);
    }
  }

  var createConnection = (function () {
    let connID = -1;

    return function (sock) {
      connID = connID + 1;

      return {
        id: connID,
        send: function (msg) {
          sock.send(JSON.stringify(msg));
        }
      }
    }
  }());

  wss.on('connection', function connection(ws) {
    var urlParts = ws.upgradeReq.url.split('/');
    var channelID = urlParts[urlParts.length - 1];
    var connection = createConnection(ws);

    // will broadcast appropriate messages to channel
    var channel = addConnectionToChannel(connection, channelID);

    ws.on('message', function incoming(rawMessage) {
      var channel = channels[channelID];

      try {
        var message = Object.assign({},
          JSON.parse(rawMessage), { from: connection.id });
        broadcastTo(channel, message, message.to);

        console.log(message);
      }
      catch (err) {
        console.warn("The message couldn't go through!");
        console.log(rawMessage);
        console.log(err);
      }
    });

    ws.on('close', function closing() {
      removeConnectionFromChannel(connection, channelID);
    });
  });

  function broadcastAll(channel, msg, exceptID = null) {
    channel.forEach(function (sock) {
      if (sock.id !== exceptID) sock.send(msg);
    });
  }

  function broadcastTo(channel, msg, targetId) {
    var target = channel.find(sock => sock.id === targetId);
    if (!target) { throw ("No such channel with ID " + targetId); }

    target.send(msg);
  }

  return wss;
}
