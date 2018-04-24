import { handleOffer, handleAnswer, handleIceCandidate, createOffer } from './rtc';

var RTCPeerConnection = RTCPeerConnection || webkitRTCPeerConnection || mozRTCPeerConnection;
const rtcConfig = {
  iceServers: [
    { url: "stun.ucsb.edu:3478" }
  ]
};


export default function webrtc(initSignal, api, sendSignal) {
  const handlers = {
    offer: handleOffer,
    answer: handleAnswer,
    iceCandidate: handleIceCandidate,
  };

  const pc = new RTCPeerConnection(rtcConfig);
  pc.onicecandidate = function (event) {
    if (event.candidate) {
      sendSignal({ type: 'iceCandidate', iceCandidate: event.candidate });
    }
  }

  const channel = queued(pc.createDataChannel("main", { negotiated: true, id: 0 }));

  function initiate() {
    const offerP = pc.createOffer();
    offerP.then(pc.setLocalDescription);
    offerP.then(offer => {
      sendSignal({ type: 'offer', sdp: offer });
    });
  }

  function handleOffer(signal) {
    const rdP = pc.setRemoteDescription(signal.offer);
    rdp.then(() =>
      pc.createAnswer().then(answer => {
        sendSignal({ type: 'answer', sdp: answer });
        pc.setLocalDescription(answer);
      })
    );
  }

  function handleAnswer({ answer }) {
    pc.setRemoteDescription(answer);
  }

  function handleIceCandidate({ iceCandidate }) {
    pc.addIceCandidate(new RTCIceCandidate(iceCandidate));
  }

  return {
    handleSignal: signal => handlers[signal.type](signal),
    send: channel.send,
    onmessage: () => {},
  }
}

function queued(channel) {
  const queue = [];
  const closedSend = msg => { queue.push(msg); };
  const openSend = channel.send;

  const api = {
    send: closedSend,
    onmessage: () => {},
  }

  channel.onmessage = api.onmessage;

  channel.onopen = function (ev) {
    queue.forEach(channel.send);
    queue = [];
    api.send = openSend;
  }

  channel.onclose = function (ev) {
    api.send = closedSend;
  }

  return api;
}
