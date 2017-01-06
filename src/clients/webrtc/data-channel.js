/**
  This module is responsible for encoding and decoding data to be sent over the
  RTC wire. It must handle system signals in addition to widget data, so all
  data is encoded as binary before being sent. The type of the message is the
  first element (signal or message). The second element depends on type:

  - For messages: [ type, message ]
  - For signals: [ type, signal, message ]
*/
module.exports = ( peerConnection, isSignalChannel ) {
  const channel = peerConnection.createDataChannel(
    isSignalChannel ? 'signals' : 'messages',
    { reliable: false })

  let queue = createQueue();
  let interface = {
    send: isSignalChannel ?
      ( signal, message ) => channel.send( JSON.stringify([ signal, message ])) :
      channel.send,
    onmessage: () => {}, // set externally
    onopen: () => {} // set externally
  };

  channel.onmessage = isSignalChannel ?
    ( message ) => interface.onmessage( message[0], message[1] ) :
    interface.onmessage;

  channel.onopen = function( evt ) {
    interface.onopen( evt );
    queue.drain( channel );
  }

  return interface;
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
