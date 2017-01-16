window.adhoc.widget = function( connection, rootElement ) {
  rootElement.innerHTML = '<div id="debug"></div>';

  appendDebug = function( m ) {
    var c = document.createElement('div');
    c.innerHTML = m;
    rootElement.appendChild(c)
  }

  connection.onmessage = appendDebug;
  connection.onsignal = appendDebug;

  connection.send('moo');
  connection.signal('bock')

  window.woot = connection
  return connection;
}
