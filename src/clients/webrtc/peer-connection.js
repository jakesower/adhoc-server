// Config
var RTCPeerConnection = RTCPeerConnection || webkitRTCPeerConnection || mozRTCPeerConnection;

const config = {
  rtcConfig: {
    iceServers: [
      { url: "stun:stun.1.google.com:19302" }
    ]
  }
}

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
function createInitiator(id, connection) {
  const peerConnection = createPeerConnection(connection);
  const opts = { reliable: false };

  const queues = { messages: createQueue(), signals: createQueue() };
  const channels = {
    messages: peerConnection.createDataChannel('messages', opts),
    signals: peerConnection.createDataChannel('signals', opts)
  }

  let interface = {
    send: queues.messages.send,
    signal: queues.signals.send,
    onmessage: () => { },
    onsignal: () => { },

    rtcHandlers: {
      iceCandidate: s => rtc.handleIceCandidate(peerConnection, s),
      answer: s => rtc.handleAnswer(peerConnection, s),
      close: () => peerConnection.close()
    }
  };

  Object.keys(channels).forEach(c =>
    channels[c].onopen = () =>
      actualizeChannel(channels[c], interface, queues.messages));

  rtc.createOffer(connection.rtcsignal, peerConnection);

  return interface;
}

/**
  Receivers are responsible for receiving the connection like so:

  1. Receive an offer
  2. Send an answer
*/

function createReceiver(id, connection) {
  const peerConnection = createPeerConnection(connection);
  const queues = { messages: createQueue(), signals: createQueue() };

  let interface = {
    send: queues.messages.send,
    signal: queues.signals.send,
    onmessage: () => { },
    onsignal: () => { },

    rtcHandlers: {
      iceCandidate: s => rtc.handleIceCandidate(peerConnection, s),
      offer: s => rtc.handleOffer(connection.rtcsignal, peerConnection, s),
      close: () => peerConnection.close()
    }
  };

  peerConnection.ondatachannel = ev => {
    actualizeChannel(ev.channel, interface, queues[ev.channel.label]);
  }

  return interface;
}

// Helpers

function actualizeChannel(channel, interface, queue) {
  if (channel.label === 'messages') {
    interface.send = message => {
      // console.log( 'sending message' );
      // console.log( message );
      channel.send(message);
    }
    channel.onmessage = message => {
      // console.log( 'got message' )
      // console.log( message.data )
      interface.onmessage(message);
    }
    queue.drain(interface.send);
  }
  else {
    interface.signal = (signal, data) => {
      channel.send(JSON.stringify([signal, data]));
    }
    channel.onmessage = message => {
      const data = JSON.parse(message.data);
      interface.onsignal(data[0], data[1])
    };
    queue.drain(interface.signal);
  }
}


function createPeerConnection(connection) {
  let pc = new RTCPeerConnection(config.rtcConfig);

  // ICE handlers
  pc.onicecandidate = function (event) {
    if (event.candidate) {
      connection.rtcsignal(
        'iceCandidate',
        { iceCandidate: event.candidate }
      );
    }
  }

  return pc;
}


// hold on to arguments until a function to call is sent
function createQueue() {
  let queue = [];

  return {
    send: function () {
      queue.push(Array.from(arguments))
    },
    drain: function (drainFunc) {
      queue.forEach(args => drainFunc.apply(null, args));
      calls = [];
    }
  }
}
