module.exports = function( handlers, catchall ) {
  return ( signal, sData ) =>
    handlers[ signal ] ?
      handlers[ signal ]( sData ) :
      catchall( signal, sData );
}
