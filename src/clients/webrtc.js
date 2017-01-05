var createInitiator = require('./webrtc/peer-connection').createInitiator;
var createReceiver = require('./webrtc/peer-connection').createReceiver;
var createSignalHandler = require('./webrtc/signal-handler');

const config = {
  signalerPath: "ws://localhost:8324"
}

/**
  This is the interface for an adhoc client that uses WebRTC as its primary
  communication channel. See: https://webrtc.org

  A signaling service is required to handle connection management and peer
  discovery. All content is sent directly from one peer to another. This client
  is comprised of three primary components:

  The *Connection Manager* combines communications among widgets, the signaler,
  and individual peer connections. This is ultimately what is returned by the
  client and what widgets interact with. It is responsible for shuttling
  messages around among components.

  A *Peer Connection* represents a connection between the local user and a
  single remote user. Messages originating locally are fanned out to each pper
  connection, and incoming remote messages are bundled together into a single
  message stream by the Connection Manager.

  A *Signaler* handles WebRTC signaling. See:
  https://www.webrtc-experiment.com/docs/WebRTC-Signaling-Concepts.html
  As of now, it's simply a WebSocket.
*/

window.adhoc = window.adhoc || {};
window.adhoc.createConnection = function( room, mode, initManifest ) {
  const uri = room ?
    ( config.signalerPath + '/' + room ) : config.signalerPath;
  const rtcSignaler = new WebSocket( uri );

  let peerConnections = {};
  let interface = {
    send: ( data ) => {},           // defined later in function
    signal: ( signal, data ) => {}, // defined later in function
    onmessage: ( func ) => {},      // to be set externally
    onsignal: ( func ) => {}        // to be set externally
  };

  // Helper for providing a minimal interface to peer connections
  const peerInterface = ( peerID ) => ({
    // channel for handling widget data -- pipe it through
    send: interface.onmessage,

    // channel to communicate with the webrtc signaler
    rtcsignal: ( s, m ) => rtcSignaler.send( JSON.stringify(
      Object.assign( m, { to: peerID, type: s }))),

    // channel for internal signals
    signal: ( s, d ) =>
      interface.onsignal( s, Object.assign( {}, d, { peerID: peerID }))
  });

  // Fan out incoming message across each peer connection
  interface.send = ( message ) => Object.keys( peerConnections ).forEach( k =>
    peerConnections[k].send( message )
  );

  interface.signal = ( signal, data ) => {}; // maybe this will be useful later


  const rtcSignalHandler = createSignalHandler({
    // A full list of peers has been received--initiate connections with all.
    peers: ({ peers }) =>
      peers.forEach( function( id ) {
        peerConnections[ id ] = createInitiator( id, peerInterface( id ));
      }),

    // A single peer has connected, create a connection, but do not initiate.
    peerConnected: ({ id }) => {
      if( !peerConnections[ id ] ) {
        peerConnections[ id ] = createReceiver( id, peerInterface( id ));
      }
    },

    // Peer disconnected. Close and remove the connection.
    peerDisconnected: ({ id }) => {
      peerConnections[ id ].signal( 'close' );
      delete peerConnections[ id ];
    }},

    // Catchall signal handler
    ( signal, data ) => {
      // A targeted signal was received, forward it.
      if( 'from' in data ) {
        if( !peerConnections[ data.from ]) {
          peerConnections[ data.from ] = createReceiver(
            data.from,
            peerInterface( id ));
        }

        peerConnections[ data.from ].signal( signal, data );
      }

      else {
        console.warn( "Unrecognized message received:" );
        console.warn({ signal: signal, data: data });
      }
    }
  ); // End signal handler

  rtcSignaler.onmessage = function( message ) {
    var data = JSON.parse( message.data );
    rtcSignalHandler( data.type, data );
  }

  return interface;
}
