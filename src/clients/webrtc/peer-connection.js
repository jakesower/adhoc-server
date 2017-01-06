// Config
var RTCPeerConnection = RTCPeerConnection || webkitRTCPeerConnection || mozRTCPeerConnection;

/**
  NOTE TO SELF:

  - Look for ways of handling queues before and after the channel is known and available.
  - Keep this separated from the signal/message handling functions
  - It may be best to compose a couple of functions here
*/

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

  const dataChannel = createDataChannel( id, peerConnection, false );
  const signalChannel = createDataChannel( id, peerConnection, true );

  let interface = {
    // Actual connection interface
    send: dataChannel.send,
    signal: signalChannel.send,
    onmessage: () => {},
    onsignal: () => {},

    rtcHandlers: {
      iceCandidate: rtc.handleIceCandidate,
      answer: s => rtc.handleAnswer( peerConnection, s ),
      close: () => peerConnection.close()
    }
  }

  rtc.createOffer( connection.rtcsignal, connection );

  return interface;
}

/**
  Receivers are responsible for receiving the connection like so:

  1. Receive an offer
  2. Send an answer
*/

function createReceiver( id, connection ) {
  const peerConnection = new createPeerConnection( connection );

  let queues = {
    messages: createQueue(),
    signals: createQueue()
  };

  let interface = {
    send: dataChannel.send,
    signal: signalChannel.send,
    onmessage: () => {},
    onsignal: () => {},

    rtcHandlers: {
      iceCandidate: rtc.handleIceCandidate,
      offer: s => rtc.handleOffer( connection.rtcsignal, peerConnection, s ),
      close: () => peerConnection.close()
    }
  }

  peerConnection.ondatachannel = function( e ) {
    // 1. detect if signal or message channel
    // 2. drain queued messages
    // 3. remove queue interface

    // if( ev.channel.label === 'signal' ) {
    //
    // }
    // const dc = createDataConnection( id, connection, dataChannel );
    // channel.send = dc.send;
    // channel.signal = dc.signal;
    //
    // channel.signal( 'manifest', connection.manfiest );
    // queueChannel.drain( channel.send );
  }

  return channel;
}


// Helpers
function createPeerConnection( connection ) {
  let pc = new RTCPeerConnection( config.rtcConfig );

  // ICE handlers
  pc.onicecandidate = function( event ) {
    if( event.candidate ) {
      connection.signal(
        'iceCandidate',
        { iceCandidate: event.candidate }
      );
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
