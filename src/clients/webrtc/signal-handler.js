module.exports = function (handlers, uCatchall) {
  const catchall = uCatchall || (s => console.warn(s));

  return (signal, sData) =>
    handlers[signal] ?
      handlers[signal](sData) :
      catchall(signal, sData);
}
