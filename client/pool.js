import Signaler from './signaler';
import webrtcConnection from './connections/webrtc';

const connections = {
  webrtc: webrtcConnection,
};

/**
 * Creates an API for sending and receiving messages. This file and its helpers
 * manage all of the different connections to make this possible. A few
 * qualities of the pool:
 *
 * - It uses a single signaling service to discover peers
 * - The connection types between this and peers can be heterogeneous
 */

export default function connectToRoom(room) {
  let id;
  let peers = {};
  let api = {
    send: msg => peers.forEach(peer => peer.send(msg)),
    onmessage: () => {}, // set externally
  };

  const signaler = Signaler(room);

  function setupConnections(signal) {
    signal.peers.foreach(peerId => {
      signaler.send({
        type: 'offerConnectionTypes',
        data: Object.keys(connections),
        to: peerId,
      });
    });
  }

  function selectConnectionType(signal) {
    const type = signal.data.find(v => Object.keys(connections).includes(v));
    setConnectionType(Object.assign({}, signal, {data: type}));
    signaler.send({
      type: 'selectConnectionType',
      data: type,
      to: signal.from,
    });
  }

  function setConnectionType(signal) {
    peers[signal.from] = connections[signal.data].init(signal, api);
  }

  // Handle global signal messages only; defer anything more specific to the
  // connection itself.
  signaler.onmessage(dispatchMessage({
    id: signal => { id = signal.id },
    peers: setupConnections,
    peerDisconnected: ({ id }) => { delete peers[id]; },
    offerConnectionTypes: selectConnectionType,
    selectConnectionType: setConnectionType,
    _: signal => peers[signal.from].handleSignal(signal),
  }));

  return api;
}


function dispatchMessage(obj) {
  return function (signal) {
    return obj[signal.type](signal);
  }
}

