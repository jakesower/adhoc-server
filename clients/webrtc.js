window.adhoc = window.adhoc || {};

(function() {
  var RTCPeerConnection = RTCPeerConnection || webkitRTCPeerConnection || mozRTCPeerConnection;

  var config = {
    signalerPath: "ws://localhost:8324",
    rtcConfig: {
      iceServers: [
        { url: "stun:stun.1.google.com:19302" }
      ]
    }
  }

  /**
    @param {String} id - the peerID
    @param {Boolean} init - is this side initiating the connection?
    @param {Object} signaler - interface with signaler (send only)
    @param {Object} widget - interface to widget (send only)
    @param {Object} connection - interface to main connection
  */
  function createPeerConnection( id, init, signaler, widget, connection ) {
    var messageQueue = [];
    var peerConnection = new RTCPeerConnection( config.rtcConfig );
    var initFunction = function(c) { };
    var channelReady = false;
    var dataChannel = createQueueChannel();

    var dataChannel = init ?
      createInitiatingChannel() :
      createReceivingChannel();

    function createInitiatingChannel() {
      var dataChannel = peerConnection.createDataChannel( 'channel' + id, { reliable: false } );
    }
    // RTC Signaling

    // Path 1: Connection initiated from local side
    // 1. Send offer
    // 2. Receive answer
    // 3. Send ICE candidate (shared between paths)
    function initiateConnection() {
      initFunction = function(c) { };

      peerConnection.createOffer( function( offer ) {
        signaler.send({ type: 'offer', offer: offer });
        peerConnection.setLocalDescription( offer );
      }, function (err) { alert('something went wrong')});
    }

    // Got an answer
    function handleAnswer( signal ) {
      peerConnection.setRemoteDescription( new RTCSessionDescription( signal.answer ));
    }

    // Path 2: Connection initiated from remote side
    // 1. Receive offer
    // 2. Send answer
    // 3. Handle ICE candidate

    // Respond to an offer -- this must be invoked on "offer" event from signal conn
    function handleOffer( signal ) {
      initFunction = function( c ) {
        connection.sendSignal({ signal: 'initConnection' });
      }

      peerConnection.setRemoteDescription( new RTCSessionDescription( signal.offer ));
      peerConnection.createAnswer( function( answer ) {
        peerConnection.setLocalDescription( answer );
        signaler.send({ type: 'answer', answer: answer });
      }, function (err) { alert('something went wrong')});

      // peerConnection.send({ type: 'signal', signal: 'initConnection' });
    }


    // ICE handlers
    peerConnection.onicecandidate = function( event ) {
      if( event.candidate ) {
        signaler.send({
          type: 'iceCandidate',
          iceCandidate: event.candidate
        })
      }
    }

    function handleIceCandidate( signal ) {
      peerConnection.addIceCandidate( new RTCIceCandidate( signal.iceCandidate ));
    }

    var handlers = {
      initiateConnection: initiateConnection,
      signal: connection.sendSignal,
      offer: handleOffer,
      answer: handleAnswer,
      iceCandidate: handleIceCandidate,
      close: function() { peerConnection.close() }
    }

    // Data handling
    function sendData( data ) {
      console.log( data );
      channelReady ?
        dataChannel.send( JSON.stringify( data )) :
        messageQueue.push( data );
    }

    dataChannel.onmessage = function( message ) {
      console.log('got message!!!11')
      console.log( message );
    }

    peerConnection.ondatachannel = function( e ) {
      dataChannel = e.channel;

      e.channel.onopen = function() {
        messageQueue.forEach( function( message ) {
          e.channel.send( message );
        })
        messageQueue = [];
        channelReady = true;
        initFunction( e.channel );
      }
    }

    dataChannel.onerror = function( err ) {
      console.error( err );
    }

    dataChannel.onclose = function() {
      channelReady = false;
      console.log( 'data channel closed' )
    }

    // Interface for interacting with intenal state; sendSignal is called by
    // the connection pool when the pool RECEIVES the message, it is called
    // sendSignal here because the signal is being sent to THIS PEER CONNECTION
    // which makes outside code easier to read, even if it's confusing here.
    return {
      sendSignal: function( data ) { handlers[ data.type ]( data ) },
      sendData: sendData,
      dataChannel: dataChannel
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
  window.adhoc.createConnection = function( room, mode, initManifest ) {
    var uri = room ? ( config.signalerPath + '/' + room ) : config.signalerPath,
        signaler = new WebSocket( uri ),
        initiate = mode === 'join',
        peerConnections = {},
        manifest = initManifest,
        signalHandlers = new Set();


    // this connection manages the peer connections and is the interface for
    // widgets -- this is the return value from this function
    var connection = {
      send: function( msg ) {
        Object.keys( peerConnections ).forEach( function( k ) {
          peerConnections[ k ].sendData( msg )});
      },
      sendToPeer: function( id, msg ) {
        peerConnections[ id ].sendData( msg );
      },
      addSignalHandler: signalHandlers.add.bind( signalHandlers ),
      removeSignalHandler: signalHandlers.delete.bind( signalHandlers )
      // onmessage is delegated to peer connections
    }

    var handleSignal = function( signal ) {
      console.log(signal)
      // handle signals locally
      if( signal.signal === 'initConnection' ) {
        connection.sendToPeer( signal.peerID, {
          type: 'signal',
          signal: 'manifest',
          manifest: manifest
        });
      }

      signalHandlers.forEach( function( handler ) { handler( signal )});
    }


    var createPeerConnectionWithInterfaces = function( peerID ) {
      // peerID, signaler interface, widget interface, connection interface
      return createPeerConnection(
        peerID,
        { send: function( msg ) { // signaler interface
            signaler.send(
              JSON.stringify( Object.assign( msg, { to: peerID }))
            )}},
        { send: connection.onmessage }, // widget interface
        { sendSignal: function( signal ) { // connection interface
          handleSignal( Object.assign( {},
            signal, { peerID: peerID, type: 'signal' }
          ))}}
      );
    }


    // ask the server for a list of peers right away
    signaler.onopen = function() {
      // console.log( 'signaler open' )
      // TODO: consider mode variable here
      // signaler.send({ type: "requestPeers" });
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
    signaler.onmessage = function( rawMessage ) {
      // console.log( rawMessage.data );
      var data = JSON.parse( rawMessage.data );

      if( data.type === 'peers' ) {
        // populate peerConnections
        data.peers.forEach( function( id ) {
          peerConnections[ id ] = createPeerConnectionWithInterfaces( id );
          peerConnections[ id ].sendSignal({ type: 'initiateConnection' });
        });
      }
      else if( data.type === 'peerConnected' ) {
        if( !peerConnections[ data.id ] ) {
          peerConnections[ data.id ] = createPeerConnectionWithInterfaces( data.id );
        }
      }
      else if( data.type === 'peerDisconnected' ) {
        console.log( peerConnections )
        peerConnections[ data.id ].sendSignal({ type: 'close' });
        delete peerConnections[ data.id ];
      }
      else if( data.from ) {
        if( !peerConnections[ data.from ] ) {
          peerConnections[ data.from ] = createPeerConnectionWithInterfaces( data.from );
        }
        // console.log( peerConnections );
        console.log( data );
        peerConnections[ data.from ].sendSignal( data );
      }
      else {
        console.warn( "Unrecognized message received:" );
        console.warn( data );
      }
    };

    return connection;
  }


}());
