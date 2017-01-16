window.adhoc.widget = function( connection, rootElement ) {
  connection.onmessage = console.log;

  rootElement.innerHTML = 'Oh hai';
}
