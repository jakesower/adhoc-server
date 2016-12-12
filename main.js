var express = require('express');
var app = express();
var port = 3001;
var webSocketPort = 8324;

var WebSocketServer = require('ws').Server;
var wss = new WebSocketServer({ port: webSocketPort });

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

  console.log( 'id ' + connection.id + ' connected to channel ' + channelID );
  channels[ channelID ].push( connection );
}

function removeConnectionFromChannel( connection, channelID ) {
  if( channels[ channelID ]) {
    console.log( 'id ' + connection.id + ' disconnected from channel ' + channelID );
    channels[ channelID ] = channels[ channelID ].filter( c => c !== connection );

    if( channels[ channelID ].length === 0 ){
      delete channels[ channelID ];
    }
  }
  else {
    console.log( 'id ' + connection.id + ' TRIED disconnecting from channel ' + channelID );
  }
}

var createConnection = (function () {
  let connID = -1;

  return function( sock ) {
    var queue = [];
    connID = connID + 1;

    var connection = {
      id: connID,
      send: function( msg ) {
        sock.send( JSON.stringify( msg ));
      }
    }
    //   send: function( msg ) {
    //     if( sock.readyState !== WebSocket.OPEN ) {
    //       queue.push( msg );
    //     }
    //     else {
    //       sock.send( msg );
    //     }
    //   }
    // };

    return connection;
  }
}());

wss.on( 'connection', function connection( ws ){
  var urlParts = ws.upgradeReq.url.split( '/' );
  var channelID = urlParts[ urlParts.length - 1 ];
  var connection = createConnection( ws );

  addConnectionToChannel( connection, channelID );

  var channel = channels[ channelID ];

  ws.on( 'message', function incoming( rawMessage ){
    var message = JSON.parse( rawMessage );

    console.log( "message for " + channelID + ":" )
    console.log( message );

    // special messages that the server must handle
    if( message.type === 'connect' ) {
      if( channel.length === 1 ) {
        ws.send( JSON.stringify({ type: "error", description: "room is empty" }));
      }
      else {
        broadcastRandom( channel, { type: "connect", peer: connection.id }, connection );
      }
    }
    else if( message.to ) {
      broadcastTo( channel, message, message.to );
    }
    else {
      broadcastAll( channel, message, connection );
    }
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

function broadcastRandom( channel, msg, except = null ) {
  if( channel.length < 2 ) { throw "Must have at least two connections" }
  var rKey = Math.floor( Math.random() * channel.length ),
      rKey2 = Math.ceil( Math.random() * ( channel.length - 1 ));

  var target = channel[ rKey ].id === except.id ?
    channel[ (( rKey + rKey2 ) % channel.length )] :
    channel[ rKey ];

  target.send( msg );
}

function broadcastTo( channel, msg, targetId ) {
  var target = channel.find( sock => sock.id === targetId );
  if( !target ) { throw( "No such channel with ID " + targetId ); }

  target.send( msg );
}

app.use( function( req, res, next ) {
  res.header( "Access-Control-Allow-Origin", "*" );
  res.header( "Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept" );
  next();
});

app.get( '/widgets.json', function( req, res, next ) {
  res.sendFile(__dirname + '/widgets.json')
});

app.get( '/widgets/:widget(*)', function( req, res, next ){
  var file = req.params.widget;
  var path = __dirname + '/widgets/' + file;

  res.sendFile( path );
});

app.listen( port );
console.log('listening on port ' + port);
