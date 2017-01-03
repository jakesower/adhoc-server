// Config
var RTCPeerConnection = RTCPeerConnection || webkitRTCPeerConnection || mozRTCPeerConnection;

const config = {
  rtcConfig: {
    iceServers: [
      { url: "stun:stun.1.google.com:19302" }
    ]
  }
}

var createSignalHandler = require('./signal-handler');
var rtc = require('./rtc');

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

/**
  Initiators are responsible for initiating the connection like so:

  1. Send an offer
  2. Receive an answer
*/
function createInitiator( id, connection ) {
  const peerConnection = createPeerConnection( connection );
  const dataChannel = peerConnection.createDataChannel(
    'channel' + id, { reliable: false });
  const queueChannel = createQueueChannel();

  let channel = {
    send: queueChannel.send,
    signal: createSignalHandler({
      iceCandidate: rtc.handleIceCandidate,
      answer: s => rtc.handleAnswer( connection.signal, peerConnection, s ),
    })
  }

  // send the offer
  rtc.createOffer( connection.signal, peerConnection );

  // handle activation once the offer cycle completes
  dataChannel.onopen = function() {
    channel.send = createDataConnection( id, connection, dataChannel );
    queueChannel.drain( channel.send );
  }

  return channel;
}

/**
  Receivers are responsible for receiving the connection like so:

  1. Receive an offer
  2. Send an answer
*/

function createReceiver( id, connection ) {
  const peerConnection = new createPeerConnection( connection );
  const queueChannel = createQueueChannel( signalHandlers );

  let channel = {
    send: queueChannel.send,
    signal: createSignalHandler({
      iceCandidate: rtc.handleIceCandidate,
      offer: s => rtc.handleOffer( connection.signal, peerConnection, s ),
    })
  }

  peerConnection.ondatachannel = function( e ) {
    channel.send = createDataConnection( id, connection, e.channel );
    queueChannel.drain( channel.send );
  }

  return channel;
}


// Helpers

function createDataConnection( id, connection, dataChannel ) {
  dataChannel.onmessage = connection.send;

  return {
    send: dataChannel.send,
    signal: function() { }
  }
}


function createPeerConnection( connection ) {
  const pc = new RTCPeerConnection( config.rtcConfig );

  // ICE handlers
  pc.onicecandidate = function( event ) {
    if( event.candidate ) {
      connection.signal(
        'iceCandidate'
        { iceCandidate: event.candidate }
      })
    }
  }

  return pc;
}


function createQueue() {
  let queue = [];

  return {
    send: msg => queue.push( msg ),
    drain: function( channel ) {
      queue.forEach( message => channel.send( message ));
      queue = [];
    }
  }
}
