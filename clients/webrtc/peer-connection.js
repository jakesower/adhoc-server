// Config
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
module.exports = {
  createInitiator,
  createReceiver
}

function createPeerConnection( id, signaler, widget, connection ) {
  var messageQueue = [];
  var peerConnection = new RTCPeerConnection( config.rtcConfig );
  var initFunction = function(c) { };
  var channelReady = false;
  var dataChannel = createQueueChannel();

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


function createQueue = function() {
  var queue = [];

  return {
    send: msg => queue.push( msg ),
    queue
  }
}
