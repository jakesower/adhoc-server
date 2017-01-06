/**
  ADHOC BOOTSTRAPPER

  This page is the gateway to the Adhoc system. It performs the following vital
  functions:

  - Connects to rooms via adhoc compliant connectors
  - Reads widget catalogs, displays them, and allows their selection
  - Initializes widgets and passes control to them

  - Config object uses the following parameters:
  @param {URI} widgetURI - the root path for widget source files
  @param {URI} widgetCatalog - the path to a widgets.json file
  @param {Element} domRoot - a DOM element for the widget to render into

  The bootstrapper expects window.adhoc.createConnection to be defined.
*/

(function() {
  window.adhoc = window.adhoc || {};

  var config = {
    widgetCatalog: "http://localhost:3001/widgets.json",
    widgetPath: "http://localhost:3001",
    domRoot: document.querySelector( 'main' )
  }

  // to be defined elsewhere before this file is executed
  var createConnection = window.adhoc.createConnection;

  function adhocInit() {
    var room = roomFromURI();

    room ?
      connectToRoom( room ) :
      presentWidgets();
  }


  function connectToRoom( room ) {
    let connection = createConnection( room, "join" );
    connection.onsignal = function( signal, data ) {
      if( signal === 'manifest' && data.widgetPath ) {
        connection.onsignal = function() {};
        connection.manifest.widgetPath = data.widgetPath;
        loadWidget( data.widgetPath, function() {
          window.adhoc.widget( connection, config.domRoot );
        });
      }
    }
  }


  function presentWidgets() {
    var template = document.getElementById( 'catalog-item-template' ).content;

    function populateTemplate( parts ) {
      var name = parts.name || "(no name)",
          description = parts.description || "(no description)";

      var newNode = document.importNode( template, true );

      Object.keys( parts ).forEach( function( k ) {
        var n = newNode.querySelector( '.' + k );
        if( n ) { n.textContent = parts[ k ]; }
      });

      newNode.querySelector('li').dataset.location = parts.location;

      return newNode;
    }

    // may wish to refactor to use XHR rather than fetch for compatibility
    // also, may wish to use callbacks rather than promises
    fetch( config.widgetCatalog )
      .then( function( d ){ return d.json(); })
      .then( function( catalog ) {
        var widgetList = document.createElement('ul');
        catalog.widgets.forEach( function( widget ) {
          widgetList.appendChild( populateTemplate( widget ));
        });

        widgetList.addEventListener( 'click', function( event ) {
          var liNode = event.path.find( function( elt ) {
            return elt.dataset.location;
          });
          var wPath = liNode.dataset.location;

          // FIXME
          loadWidget(
            wPath,
            function() {
              var room = randomSHA1();
              var connection = createConnection( room, "create", { widgetPath: wPath });
              history.pushState({ room: connection.room }, "room", "?room=" + room );
              window.adhoc.widget( connection, config.domRoot );
            }
          );
        });

        document.querySelector( 'body > main' ).appendChild( widgetList );
      })
  }


  function loadWidget( path, callback ) {
    var uri = config.widgetPath + path;

    (function(d, script) {
      var script = document.createElement('script');
      script.type = 'text/javascript';
      script.async = true;
      script.onload = function() {
        script.onload = null;
        if( callback ) callback();
      };
      script.src = uri;
      document.getElementsByTagName('head')[0].appendChild(script);
    }(document));
  }


  function randomSHA1() {
    var buf = new Uint8Array( 20 );
    window.crypto.getRandomValues( buf );
    out = '';
    for( var i=0; i < buf.length; i+=1 ) {
      var s = buf[i].toString( 16 );
      out = out + ( s.length === 1 ? '0' : '' ) + s;
    }
    return out;
  }


  function roomFromURI() {
    var isSHA1 = function( str ) { return /^[0-f]{40}$/.test( str ); }

    // first try the path
    var pathname = window.location.pathname.split("/"),
        roomURICand = config.room || pathname[ pathname.length - 1 ];

    if( isSHA1( roomURICand )) return roomURICand;

    // if that didn't work, try the query string
    var queryArgs = window.location.search.substring(1).split('&');
    var match = queryArgs.find( function( qa ) {
      return qa.split('=')[0] === 'room';
    });

    if( match ) {
      var cand = match.split('=')[1];
      if( isSHA1( cand )) return cand;
    }

    return null;
  }

  adhocInit();
}());
