window.adhoc.widget = function( connection, rootElement ) {
  rootElement.innerHTML = '<div id="debug"></div>';

  appendDebug = function( m ) {
    rootElement.appendChild('<div>' + m + '</div>')
  }

  connection.onmessage = appendDebug;
  connection.onsignal = appendDebug;

  connection.send('moo');
  connection.signal('bock')

}
