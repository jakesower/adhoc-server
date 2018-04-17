(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
module.exports = {
  port: 3001,
  signalerPath: '',
};

},{}],2:[function(require,module,exports){
var createInitiator = require('./webrtc/peer-connection').createInitiator;
var createReceiver = require('./webrtc/peer-connection').createReceiver;
var createSignalHandler = require('./webrtc/signal-handler');
var config = require('../../config');

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
window.adhoc.createConnection = function (room, mode, initManifest) {
  const protocol =
    window.location.protocol === 'https:' ? 'wss://' : 'ws://' +
    window.location.host +
    window.location.pathname;
  const uri = room ? (config.signalerPath + '/' + room) : config.signalerPath;
  const rtcSignaler = new WebSocket(protocol + uri);

  let manifest = initManifest || {};
  let peerConnections = {};
  let interface = {
    send: (data) => { },           // defined later in function
    signal: (signal, data) => { }, // defined later in function
    onmessage: (func) => { },      // to be set externally
    onsignal: (func) => { },       // to be set externally

    manifest
  };

  // Helper for providing a minimal interface to peer connections
  const peerInterface = (peerID) => ({
    // channel to communicate with the webrtc signaler
    rtcsignal: (s, m) => rtcSignaler.send(JSON.stringify(
      Object.assign(m, { to: peerID, type: s }))),
  });

  // Fan out incoming message across each peer connection
  interface.send = (message) => Object.keys(peerConnections).forEach(k => {
    // console.log( 'send to ' + k )
    peerConnections[k].send(message)
  });

  interface.signal = (signal, data) => { }; // maybe this will be useful later


  const rtcSignalHandler = createSignalHandler({
    // A full list of peers has been received--initiate connections with all.
    peers: ({ peers }) =>
      peers.forEach(function (id) {
        peerConnections[id] = createInitiator(id, peerInterface(id));
        peerConnections[id].signal('manifest', manifest);
        peerConnections[id].onsignal = (s, d) => interface.onsignal(s, d);
        peerConnections[id].onmessage = m => interface.onmessage(m);
      }),

    // A single peer has connected, create a connection, but do not initiate.
    peerConnected: ({ id }) => {
      if (!peerConnections[id]) {
        peerConnections[id] = createReceiver(id, peerInterface(id));
        peerConnections[id].signal('manifest', manifest);
        peerConnections[id].onsignal = (s, d) => interface.onsignal(s, d);
        peerConnections[id].onmessage = m => interface.onmessage(m);
      }
    },

    // Peer disconnected. Close and remove the connection.
    peerDisconnected: ({ id }) => {
      peerConnections[id].signal('close');
      delete peerConnections[id];
    }
  },

    // Catchall signal handler
    (signal, data) => {
      // A targeted signal was received. Have the connection handle it.
      if ('from' in data) {
        let pc = peerConnections[data.from];
        if (!pc) {
          pc = createReceiver(data.from, peerInterface(id));
          pc.signal('manifest', manifest);
          pc.onsignal = (s, d) => interface.onsignal(s, d);
          peerConnections[data.from] = pc;
        }

        pc.rtcHandlers[signal](data);
      }

      else {
        console.warn("Unrecognized message received:");
        console.warn({ signal: signal, data: data });
      }
    }
  ); // End signal handler

  rtcSignaler.onmessage = function (message) {
    var data = JSON.parse(message.data);
    rtcSignalHandler(data.type, data);
  }

  return interface;
}

},{"../../config":1,"./webrtc/peer-connection":3,"./webrtc/signal-handler":5}],3:[function(require,module,exports){
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

},{"./rtc":4}],4:[function(require,module,exports){
/**
  Functions that handle RTC boilerplate. Arguments used throughout module:

  @param {Function} signal - function to send signals to a signaler
  @param {RTCPeerConnection} peerConnection - connection to handle
  @param {Object} args - contextual arguments
*/


function handleOffer(signal, peerConnection, { offer }) {
  peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
  peerConnection.createAnswer(function (answer) {
    peerConnection.setLocalDescription(answer);
    signal('answer', { answer: answer });
  }, function (err) { alert('something went wrong') });
}

function handleAnswer(peerConnection, { answer }) {
  peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
}

function handleIceCandidate(peerConnection, { iceCandidate }) {
  peerConnection.addIceCandidate(new RTCIceCandidate(iceCandidate));
}

function createOffer(signal, peerConnection) {
  peerConnection.createOffer(function (offer) {
    signal('offer', { offer: offer });
    peerConnection.setLocalDescription(offer);
  }, function (err) { alert('something went wrong') });
}

module.exports = {
  handleOffer,
  handleAnswer,
  handleIceCandidate,
  createOffer
}

},{}],5:[function(require,module,exports){
module.exports = function (handlers, uCatchall) {
  const catchall = uCatchall || (s => console.warn(s));

  return (signal, sData) =>
    handlers[signal] ?
      handlers[signal](sData) :
      catchall(signal, sData);
}

},{}]},{},[2]);
