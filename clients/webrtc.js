var RTCPeerConnection = RTCPeerConnection || webkitRTCPeerConnection || mozRTCPeerConnection;
window.adhoc = window.adhoc || {};

(function() {
  var config = {
    wsPath: "ws://localhost:8324",
    rtcConfig: {
      iceServers: [
        { url: "stun:stun.1.google.com:19302" }
      ]
    }
  }

  function createPeerConnection( signaler, widget, id, init ) {
    var messageQueue = [];
    var localConnection = new RTCPeerConnection( config.rtcConfig );
    var dataChannel = localConnection.createDataChannel(
      'channel' + id,
      { reliable: true }
    );

    // Signaling

    // Path 1: Connection initiated from local side
    // 1. Send offer
    // 2. Receive answer
    // 3. Send ICE candidate (shared between paths)
    function initialize() {
      localConnection.sendOffer( function( offer ) {
        signaler.send({ type: 'offer', offer: offer });
        localConnection.setLocalDescription( offer );
      });
    }

    // Got an answer
    function handleAnswer( signal ) {
      localConnection.setRemoteDescription( new RTCSessionDescription( signal.answer ));
      // after this we can start sending data

      localConnection.sendIceCandidate = function( event ) {
        if( event.iceCandidate ) {
          signaler.send({ type: 'iceCandidate', candidate: event.iceCandidate });
        }
      }
    }

    // Path 2: Connection initiated from remote side
    // 1. Receive offer
    // 2. Send answer
    // 3. Handle ICE candidate

    // Respond to an offer -- this must be invoked on "offer" event from signal conn
    function handleOffer( signal ) {
      localConnection.setRemoveDescription( new RTCSessionDescription( signal.offer ));
      localConnection.createAnswer( function( answer ) {
        localConnection.setLocalDescription( answer );
        signaler.send({ type: 'answer', answer: answer });
      });
      // after this we can start sending data
    }


    // We got an ICE candidate
    function handleIceCandidate( signal ) {
      localConnection.addIceCandidate( new RTCIceCandidate( signal.iceCandidate ));
    }

    var handlers = {
      offer: handleOffer,
      answer: handleAnswer,
      iceCandidate: handleIceCandidate
    }

    // Data handling
    function sendData( data ) {
      console.log( data );
    }

    dataChannel.onmessage = widget.send;

    return function( data ) {
      sendSignal: function( data ) { handlers[ data.type ]( data ) },
      sendData: dataChannel.send,
      initialize: initialize
    }
  }

  /**
    First pass at architecture:

    - Connection acts as queue until init time
    - Once signaling connection is established, create queue conns to peers
    - Attempt connections with all peers
    - Configure ICE, etc.
    - Once an answer is received, request state if it's the first
    - As true channels come in, drain queue channels
    - Merge incoming widget messages
    - Broadcast outgoing events to all in queue pool
  */


  // highly imperative process for getting things rolling
  window.adhoc.createConnection = function( room, initiate ) {
    var uri = room ? ( config.wsPath + '/' + room ) : config.wsPath,
        signaler = new WebSocket( uri ),
        peerConnections = {};


    // this connection manages the peer connections and is the interface for
    // widgets
    var connection = {
      send: function( msg ) {
        Object.keys( peerConnection ).forEach( function( k ) {
          peerConnection.send( msg )});
      }
      // onmessage is delegated to peer connections
    }


    // ask the server for a list of peers right away
    signaler.onopen( function() {
      signaler.send({ type: "requestPeers" });
    });


    // signaler messages are all about establishing media connections rather
    // than transmitting content
    signaler.onmessage( function( data ) {
      if( data.type === "peers" ) {
        peerConnection = {};
        peerConnection = data.peers.forEach( function( id ) {
          peerConnection[ id ] = createPeerConnection(
            signaler, // the signaler connection
            { send: connection.onmessage }, // a widget interface
            id, // an ID for the connection
            true // initialize the connection immediately
          ));
        });
      }
      else if( data.from ) {
        peerConnection[ from ].sendSignal( data );
      }
      else {
        console.warn( "Unrecognized message received:" );
        console.log( data );
      }
    });

    return connection;
  }


}());
