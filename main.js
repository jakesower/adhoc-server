var express = require('express');
var app = express();
var port = 3001;

var WebSocketServer = require('ws').Server;
var wss = new WebSocketServer({ port: 8324 });

var channels = {};

function addChannel( chan, ws ) {
  if( !channels[ chan ]) {
    channels[ chan ] = new Set();
  }

  channels[ chan ].add( ws );
}

function removeChannel( chan, ws ) {
  channels[ chan ].delete( ws );

  if( channels[ chan ].size === 0 ){
    channels[ chan ] = null;
  }
}

wss.on( 'connection', function connection( ws ){
  var urlParts = ws.upgradeReq.url.split( '/' );
  var channelID = urlParts[ urlParts.length - 1 ];

  console.log( 'someone connected to channel ' + channelID );
  addChannel( channelID, ws );

  ws.on( 'message', function incoming( message ){
    console.log( 'message: '+ message );
    var channel = channels[ channelID ];

    channel.forEach( function( sock ){
      if( sock !== ws ) {
        sock.send( message );
      }
    });
  });

  ws.on( 'close', function closing(){
    removeChannel( channelID, ws );
  });
});

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
