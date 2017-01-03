var createInitiator = require('./webrtc/peer-connection').createInitiator;
var createReceiver = require('./webrtc/peer-connection').createReceiver;
var createSignalHandler = require('./signal-handler');

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
  const uri = room ? ( config.signalerPath + '/' + room ) : config.signalerPath;
  const signaler = new WebSocket( uri );

  let peerConnections = {}, // holds all known connections
      connection = {
        send: ( data ) => {},           // defined later in function
        signal: ( signal, data ) => {}, // defined later in function
        onmessage: ( func ) => {},      // to be set externally
        onsignal: ( func ) => {}        // to be set externally
      };

  /**
    There are a few types of signal messages to be handled:

    1. A list of peers. This is done only at initial connection time. It is
       used to create and initiate peer connection.
    2. A peer connected event. Create it, but wait for the peer to initialize
       it.
    3. Messages from a particular peer. These are delegated to the peer
       connection.
  */
  const signalHandler = createSignalHandler(
    {
      peers: ({ peers }) =>
        peers.forEach( function( id ) {
          peerConnections[ id ] = createInitiator( id, peerInterface( id ));
        }),

      peerConnected: ({ id }) => {
        if( !peerConnections[ data.id ] ) {
          peerConnections[ data.id ] = createReceiver(
            data.id,
            peerInterface( id ));
        }
      },

      peerDisconnected: ({ id }) => {
        console.log( peerConnections )
        peerConnections[ data.id ].signal( 'close' );
        delete peerConnections[ data.id ];
      }
    },

    // catchall signal handler
    ( signal, data ) => {
      if( data.from ) {
        if( !peerConnections[ data.from ] ) {
          peerConnections[ data.from ] = createReceiver(
            data.from,
            peerInterface( id ));
        }
        // console.log( peerConnections );
        console.log( data );
        peerConnections[ data.from ].signal( signal, data );
      }

      else {
        console.warn( "Unrecognized message received:" );
        console.warn( data );
      }
    }
  ); // End signal handler


  const sendAll = ( msg ) =>
    Object.keys( peerConnections ).forEach( function( k ) {
      peerConnections[ k ].send( msg )});

  const sendToPeer = ( id, msg ) => peerConnections[ id ].send( msg );

  const handlePeerSignal = ( signal, sData ) => {
    console.log(signal)
    // handle signals locally
    if( sData.signal === 'initConnection' ) {
      sendToPeer( sData.peerID, {
        type: 'signal',
        signal: 'manifest',
        manifest: manifest
      });
    }

    connection.onsignal( signal, sData );
  }

  var peerInterface = function( peerID ) => ({
    send: ( m ) =>
      signaler.send( JSON.stringify( Object.assign( m, { to: peerID })),

    signal: ( signal, sData ) =>
      handleSignal( signal, Object.assign( {},
        sData, { peerID: peerID, type: 'signal' }
      ))
  })

  signaler.onmessage = function( rawMessage ) {
    var data = JSON.parse( rawMessage.data );
    handleSignal( data.type, data );
  };

  return connection;
}
