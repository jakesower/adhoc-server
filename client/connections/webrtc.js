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
