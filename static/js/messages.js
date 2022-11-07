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
      switch (errorCode) {
        case 0: // ML_ERROR_GRACEFUL_TERMINATION
          break;

        case -100: // ML_ERROR_NO_VIDEO_TRAFFIC
          snackbarLogLong("No video received from host. Check the host PC's firewall and port forwarding rules.");
          break;

        case -101: // ML_ERROR_NO_VIDEO_FRAME
          snackbarLogLong("Your network connection isn't performing well. Reduce your video bitrate setting or try a faster connection.");
          break;

        default:
          snackbarLogLong("Connection terminated");
          break;
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
      // Show the video stream now
      $("#nacl_module")[0].style.opacity = 1.0;
    } else if (msg.data.indexOf('controllerRumble: ' ) === 0) {
      const eventData = msg.data.split( ' ' )[1].split(',');
      const gamepadIdx = parseInt(eventData[0]);
      const weakMagnitude = parseFloat(eventData[1]);
      const strongMagnitude = parseFloat(eventData[2]);
      console.log("Playing rumble on gamepad " + gamepadIdx + " with weakMagnitude " + weakMagnitude + " and strongMagnitude " + strongMagnitude);

      // We may not actually have a gamepad at this index.
      // Even if we do have a gamepad, it may not have a vibrationActuator associated with it.
      navigator.getGamepads()[gamepadIdx]?.vibrationActuator?.playEffect('dual-rumble', {
        startDelay: 0,
        duration: 5000, // Moonlight should be sending another rumble event when stopping.
        weakMagnitude: weakMagnitude,
        strongMagnitude: strongMagnitude,
      });
    }
  }
}
