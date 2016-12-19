(function() {
  var config = {
    wsPath: "ws://localhost:8324",
    iceCandidates: [
      { url: "stun:stun.1.google.com:19302" }
    ]
  }

  window.adhoc = window.adhoc || {};

  window.adhoc.createConnection = function( room ) {
    var uri = room ? ( config.wsPath + '/' + room ) : config.wsPath,
        signalingChannel = new WebSocket( uri ),
        RTCPeerConnection = RTCPeerConnection || webkitRTCPeerConnection,
        connection;

    signalingChannel.onopen( function() {
      signalingChannel.send({ type: "ping" });
    });

    signalingChannel.onmessage( function() {
      switch( data.type ) {
        case "peers":
          connection = new RTCPeerConnection
      }
    })

    var connection = {
      send: function( msg ) {
        if( sock.readyState === 0 ) {
          messageQueue.push( msg );
        }
        else {
          console.log( 'sent:' );
          console.log( msg );
          var hook = systemHooks.outgoing[ msg.type ];
          hook ?
            hook( msg, connection ) :
            sock.send( JSON.stringify( msg ));
        }
      },
      onmessage: function() { },
      widgetPath: null,
      room: room,
      peersAwaitingConnection: []
    }

    sock.onmessage = function( message ) {
      var data = message.data;

      // detect if it's a binary message
      console.log( data )
      var msg = JSON.parse( data );
      var hook = systemHooks.incoming[ msg.type ];
      console.log( 'received:' );
      console.log( data );

      hook ?
        hook( data, connection ) :
        connection.onmessage( data );
    }

    return connection;
  }
}());
