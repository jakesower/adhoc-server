window.adhoc.widget = function (connection, rootElement) {
  rootElement.innerHTML = `
    <input type="text" id="input"> <button id="send">Send</button>
    <div id="debug"></div>
  `

  var debugDiv = document.querySelector('#debug');
  var input = document.querySelector('#input ');
  var send = document.querySelector('#send');

  send.addEventListener('click', function (e) {
    connection.send(input.value);
    input.value = '';
  })

  appendDebug = function (type, m) {
    console.log(m)
    var c = document.createElement('div');
    c.innerHTML = type + ': ' + m;
    rootElement.appendChild(c)
  }

  connection.onmessage = m => appendDebug('message', m.data);
  connection.onsignal = m => appendDebug('signal', m);

  window.woot = connection
  return connection;
}
