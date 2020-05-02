var callbacks = {}
var callbacks_ids = 1;

/**
 * var sendMessage - Sends a message with arguments to the NaCl module
 *
 * @param  {String} method A named method
 * @param  {(String|Array)} params An array of options or a signle string
 * @return {void}        The NaCl module calls back trought the handleMessage method
 */
var sendMessage = function(method, params) {
  return new Promise(function(resolve, reject) {
    var id = callbacks_ids++;
    callbacks[id] = {
      'resolve': resolve,
      'reject': reject
    };

    common.naclModule.postMessage({
      'callbackId': id,
      'method': method,
      'params': params
    });
  });
}

/**
 * handleMessage - Handles messages from the NaCl module
 *
 * @param  {Object} msg An object given by the NaCl module
 * @return {void}
 */
function handleMessage(msg) {
  if (msg.data.callbackId && callbacks[msg.data.callbackId]) { // if it's a callback, treat it as such
    callbacks[msg.data.callbackId][msg.data.type](msg.data.ret);
    delete callbacks[msg.data.callbackId]
  } else { // else, it's just info, or an event
    console.log('%c[messages.js, handleMessage]', 'color:gray;', 'Message data: ', msg.data)
    if (msg.data.indexOf('streamTerminated: ') === 0) { // if it's a recognized event, notify the appropriate function
      // Release our keep awake request
      chrome.power.releaseKeepAwake();

      // Show a termination snackbar message if the termination was unexpected
      var errorCode = parseInt(msg.data.replace('streamTerminated: ', ''));
      if (errorCode !== 0) {
        if (errorCode === -100) { // ML_ERROR_NO_VIDEO_TRAFFIC
          snackbarLogLong("No video received from host. Check the host PC's firewall and port forwarding rules.");
        }
        else {
          snackbarLogLong("Connection terminated");
        }
      }

      api.refreshServerInfo().then(function(ret) {
        // Return to app list with new currentgame
        showApps(api);
      }, function() {
        // Return to app list anyway
        showApps(api);
      });
    } else if (msg.data === 'Connection Established') {
      $('#loadingSpinner').css('display', 'none');
      $('body').css('backgroundColor', 'black');

      // Keep the display awake while streaming
      chrome.power.requestKeepAwake("display");
    } else if (msg.data.indexOf('ProgressMsg: ') === 0) {
      $('#loadingMessage').text(msg.data.replace('ProgressMsg: ', ''));
    } else if (msg.data.indexOf('TransientMsg: ') === 0) {
      snackbarLog(msg.data.replace('TransientMsg: ', ''));
    } else if (msg.data.indexOf('DialogMsg: ') === 0) {
      // FIXME: Really use a dialog
      snackbarLogLong(msg.data.replace('DialogMsg: ', ''));
    } else if (msg.data === 'displayVideo') {
      $("#listener").addClass("fullscreen");
    }
  }
}
