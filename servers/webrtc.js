/**
  A simple webrtc signalling server. It works similarly to:
  https://www.tutorialspoint.com/webrtc/webrtc_signaling.htm

  Typical connection workflow:

  - A connects to server
  - Server tells A it is alone in room
  - B connects to server
  - Server tells B to stand by
  - Server tells A that B has connected
  - A sends offer to B via server
  - B sends answer to A via server
  - A sends ICE candidate to B via server
  - B sends ICE candidate to A via server
*/

module.exports = function({ port }) {
  var WebSocketServer = require('ws').Server;
  var wss = new WebSocketServer({ port: port });

  var channels = {};
  var awaitingConnection = [];
  var generateID = (function() {
    let i = -1;

    return function() {
      i = i + 1;
      return i;
    }
  }());

  function addConnectionToChannel( connection, channelID ) {
    if( !channels[ channelID ]) {
      channels[ channelID ] = [];
    }

    var channel = channels[ channelID ];

    console.log( 'id ' + connection.id + ' connected to channel ' + channelID );
    channel.push( connection );

    broadcastTo( channel, {
      type: 'peers',
      peers: channel.filter( c => c.id !== connection.id ).map( c => c.id )
    }, connection.id );

    broadcastAll( channel, {
      type: 'peerConnected',
      id: connection.id
    }, connection.id );
  }

  function removeConnectionFromChannel( connection, channelID ) {
    if( channels[ channelID ]) {
      console.log( 'id ' + connection.id + ' disconnected from channel ' + channelID );
      channels[ channelID ] = channels[ channelID ].filter( c => c !== connection );

      if( channels[ channelID ].length === 0 ){
        delete channels[ channelID ];
      }

      broadcastAll( channel, {
        type: 'peerDisconnected',
        id: connection.id
      });
    }
    else {
      console.log( 'id ' + connection.id + ' TRIED disconnecting from channel ' + channelID );
    }
  }

  var createConnection = (function () {
    let connID = -1;

    return function( sock ) {
      connID = connID + 1;

      return {
        id: connID,
        send: function( msg ) {
          sock.send( JSON.stringify( msg ));
        }
      }
    }
  }());

  wss.on( 'connection', function connection( ws ){
    var urlParts = ws.upgradeReq.url.split( '/' );
    var channelID = urlParts[ urlParts.length - 1 ];
    var connection = createConnection( ws );

    // will broadcast appropriate messages to channel
    addConnectionToChannel( connection, channelID );

    // store channel info for use in future messages
    var channel = channels[ channelID ];

    ws.on( 'message', function incoming( rawMessage ){
      var message = JSON.parse( rawMessage );
      broadcastTo( channel, message, message.to );
    });

    ws.on( 'close', function closing() {
      removeConnectionFromChannel( connection, channelID );
    });
  });

  function broadcastAll( channel, msg, except = null ) {
    channel.forEach( function( sock ) {
      if( sock.id !== except.id ) sock.send( msg );
    });
  }

  function broadcastTo( channel, msg, targetId ) {
    var target = channel.find( sock => sock.id === targetId );
    if( !target ) { throw( "No such channel with ID " + targetId ); }

    target.send( msg );
  }

  return wss;
}
