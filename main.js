var express = require('express');
var fs = require('fs');

var app = express();
var port = 3001;
var webSocketPort = 8324;

var WebSocketServer = require('ws').Server;
var wss = require('./servers/websocket')({ port: webSocketPort });

app.use( function( req, res, next ) {
  res.header( "Access-Control-Allow-Origin", "*" );
  res.header( "Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept" );
  next();
});

app.get( '/widgets.json', function( req, res, next ) {
  res.sendFile(__dirname + '/widgets.json')
});

app.get( '/widgets/:widget(*)', function( req, res, next ) {
  var file = req.params.widget;
  var path = fs.realpathSync( __dirname + '/widgets/' + file );

  res.sendFile( path );
});

app.get( '*', function( req, res, next ) {
  res.sendFile( fs.realpathSync( __dirname + '/websocket-client.html' ));
})

app.listen( port );
console.log('listening on port ' + port);
