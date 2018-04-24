const config = {
  signalerPath: '/ws',
}

export default function (room) {
  const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
  const host = window.location.host;
  const uri = room ? (config.signalerPath + '/' + room) : config.signalerPath;

  return new WebSocket(protocol + uri);
}
