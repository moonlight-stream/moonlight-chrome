function guuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0,
      v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function uniqueid() {
  return 'xxxxxxxxxxxxxxxx'.replace(/[x]/g, function(c) {
    var r = Math.random() * 16 | 0;
    return r.toString(16);
  });
}

function generateRemoteInputKey() {
  return 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'.replace(/[x]/g, function(c) {
    var r = Math.random() * 16 | 0;
    return r.toString(16);
  });
}

function generateRemoteInputKeyId() {
  return ((Math.random() - 0.5) * 0x7FFFFFFF) | 0;
}

function getConnectedGamepadMask() {
  var count = 0;
  var mask = 0;
  var gamepads = navigator.getGamepads ? navigator.getGamepads() : [];

  for (var i = 0; i < gamepads.length; i++) {
    var gamepad = gamepads[i];
    if (gamepad) {
      // See logic in gamepad.cpp
      // These must stay in sync!

      if (!gamepad.connected) {
        // Not connected
        continue;
      }

      if (gamepad.timestamp == 0) {
        // On some platforms, Chrome returns "connected" pads that
        // really aren't, so timestamp stays at zero. To work around this,
        // we'll only count gamepads that have a non-zero timestamp in our
        // controller index.
        continue;
      }

      mask |= 1 << count++;
    }
  }

  console.log('%c[utils.js, getConnectedGamepadMask]', 'color:gray;', 'Detected ' + count + ' gamepads');
  return mask;
}

String.prototype.toHex = function() {
  var hex = '';
  for (var i = 0; i < this.length; i++) {
    hex += '' + this.charCodeAt(i).toString(16);
  }
  return hex;
}

function NvHTTP(address, clientUid, userEnteredAddress = '') {
  console.log('%c[utils.js, NvHTTP Object]', 'color: gray;', this);
  this.address = address;
  this.ppkstr = null;
  this.paired = false;
  this.currentGame = 0;
  this.serverMajorVersion = 0;
  this.appVersion = '';
  this.clientUid = clientUid;
  this._pollCount = 0;
  this._consecutivePollFailures = 0;
  this.online = false;

  this.userEnteredAddress = userEnteredAddress; // if the user entered an address, we keep it on hand to try when polling
  this.serverUid = '';
  this.GfeVersion = '';
  this.supportedDisplayModes = {}; // key: y-resolution:x-resolution, value: array of supported framerates (only ever seen 30 or 60, here)
  this.gputype = '';
  this.numofapps = 0;
  this.hostname = address;
  this.externalIP = '';
  this._pollCompletionCallbacks = [];

  _self = this;
};

function _arrayBufferToBase64(buffer) {
  var binary = '';
  var bytes = new Uint8Array(buffer);
  var len = bytes.byteLength;
  for (var i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function _base64ToArrayBuffer(base64) {
  var binary_string = window.atob(base64);
  var len = binary_string.length;
  var bytes = new Uint8Array(len);
  for (var i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
}

NvHTTP.prototype = {
  refreshServerInfo: function() {
    if (this.ppkstr == null) {
      return sendMessage('openUrl', [this._baseUrlHttp + '/serverinfo?' + this._buildUidStr(), this.ppkstr, false]).then(function(retHttp) {
        this._parseServerInfo(retHttp);
      }.bind(this));
    }

    // try HTTPS first
    return sendMessage('openUrl', [this._baseUrlHttps + '/serverinfo?' + this._buildUidStr(), this.ppkstr, false]).then(function(ret) {
      if (!this._parseServerInfo(ret)) { // if that fails
        // try HTTP as a failover.  Useful to clients who aren't paired yet
        return sendMessage('openUrl', [this._baseUrlHttp + '/serverinfo?' + this._buildUidStr(), this.ppkstr, false]).then(function(retHttp) {
          this._parseServerInfo(retHttp);
        }.bind(this));
      }
    }.bind(this),
      function(error) {
        if (error == -100) { // GS_CERT_MISMATCH
          // Retry over HTTP
          console.warn('%c[utils.js, utils.js, refreshServerInfo]', 'color: gray;', 'Certificate mismatch. Retrying over HTTP', this);
          return sendMessage('openUrl', [this._baseUrlHttp + '/serverinfo?' + this._buildUidStr(), this.ppkstr, false]).then(function(retHttp) {
            this._parseServerInfo(retHttp);
          }.bind(this));
        }
      }.bind(this));
  },

  // refreshes the server info using a given address.  This is useful for testing whether we can successfully ping a host at a given address
  refreshServerInfoAtAddress: function(givenAddress) {
    if (this.ppkstr == null) {
      // Use HTTP if we have no pinned cert
      return sendMessage('openUrl', ['http://' + givenAddress + ':47989' + '/serverinfo?' + this._buildUidStr(), this.ppkstr, false]).then(function(retHttp) {
          return this._parseServerInfo(retHttp);
      }.bind(this));
    }

    // try HTTPS first
    return sendMessage('openUrl', ['https://' + givenAddress + ':47984' + '/serverinfo?' + this._buildUidStr(), this.ppkstr, false]).then(function(ret) {
      if (!this._parseServerInfo(ret)) { // if that fails
        console.log('%c[utils.js, utils.js, refreshServerInfoAtAddress]', 'color: gray;', 'Failed to parse serverinfo from HTTPS, falling back to HTTP');
        // try HTTP as a failover.  Useful to clients who aren't paired yet
        return sendMessage('openUrl', ['http://' + givenAddress + ':47989' + '/serverinfo?' + this._buildUidStr(), this.ppkstr, false]).then(function(retHttp) {
          return this._parseServerInfo(retHttp);
        }.bind(this));
      }
    }.bind(this),
      function(error) {
        if (error == -100) { // GS_CERT_MISMATCH
          // Retry over HTTP
          console.warn('%c[utils.js, utils.js, refreshServerInfoAtAddress]', 'color: gray;', 'Certificate mismatch. Retrying over HTTP', this);
          return sendMessage('openUrl', ['http://' + givenAddress + ':47989' + '/serverinfo?' + this._buildUidStr(), this.ppkstr, false]).then(function(retHttp) {
            return this._parseServerInfo(retHttp);
          }.bind(this));
        }
      }.bind(this));
  },

  // called every few seconds to poll the server for updated info
  pollServer: function(onComplete) {
    // Pend this callback on completion
    this._pollCompletionCallbacks.push(onComplete);

    // Check if a poll was already in progress
    if (this._pollCompletionCallbacks.length > 1) {
      // Don't start another. The one in progress will
      // alert our caller too.
      return;
    }

    this.selectServerAddress(function(successfulAddress) {
      // Successfully determined server address. Update base URL.
      this.address = successfulAddress;
      this._baseUrlHttps = 'https://' + successfulAddress + ':47984';
      this._baseUrlHttp = 'http://' + successfulAddress + ':47989';

      // Poll for the app list every 10 successful serverinfo polls.
      // Not including the first one to avoid PCs taking a while to show
      // as online initially
      if (this.paired && this._pollCount++ % 10 == 1) {
        this.getAppListWithCacheFlush();
      }

      this._consecutivePollFailures = 0;
      this.online = true;

      // Call all pending completion callbacks
      var completion;
      while ((completion = this._pollCompletionCallbacks.pop())) {
        completion(this);
      }
    }.bind(this), function() {
      if (++this._consecutivePollFailures >= 2) {
        this.online = false;
      }

      // Call all pending completion callbacks
      var completion;
      while ((completion = this._pollCompletionCallbacks.pop())) {
        completion(this);
      }
    }.bind(this));
  },

  // initially pings the server to try and figure out if it's routable by any means.
  selectServerAddress: function(onSuccess, onFailure) {
    // TODO: Deduplicate the addresses
    this.refreshServerInfoAtAddress(this.address).then(function(successPrevAddr) {
      onSuccess(this.address);
    }.bind(this), function(successPrevAddr) {
      this.refreshServerInfoAtAddress(this.hostname + '.local').then(function(successLocal) {
        onSuccess(this.hostname + '.local');
      }.bind(this), function(failureLocal) {
        this.refreshServerInfoAtAddress(this.externalIP).then(function(successExternal) {
          onSuccess(this.externalIP);
        }.bind(this), function(failureExternal) {
          this.refreshServerInfoAtAddress(this.userEnteredAddress).then(function(successUserEntered) {
            onSuccess(this.userEnteredAddress);
          }.bind(this), function(failureUserEntered) {
            console.warn('%c[utils.js, utils.js,  selectServerAddress]', 'color: gray;', 'Failed to contact host ' + this.hostname, this);
            onFailure();
          }.bind(this));
        }.bind(this));
      }.bind(this));
    }.bind(this));
  },

  toString: function() {
    var string = '';
    string += 'server address: ' + this.address + '\r\n';
    string += 'server UID: ' + this.serverUid + '\r\n';
    string += 'is paired: ' + this.paired + '\r\n';
    string += 'current game: ' + this.currentGame + '\r\n';
    string += 'server major version: ' + this.serverMajorVersion + '\r\n';
    string += 'appversion: ' + this.appVersion + '\r\n';
    string += 'GFE version: ' + this.GfeVersion + '\r\n';
    string += 'gpu type: ' + this.gputype + '\r\n';
    string += 'number of apps: ' + this.numofapps + '\r\n';
    string += 'supported display modes: ' + '\r\n';
    for (var displayMode in this.supportedDisplayModes) {
      string += '\t' + displayMode + ': ' + this.supportedDisplayModes[displayMode] + '\r\n';
    }
    return string;
  },

  _parseServerInfo: function(xmlStr) {
    $xml = this._parseXML(xmlStr);
    $root = $xml.find('root');

    if ($root.attr("status_code") != 200) {
      return false;
    }

    if (this.serverUid != $root.find('uniqueid').text().trim() && this.serverUid != "") {
      // if we received a UID that isn't the one we expected, fail.
      return false;
    }

    console.log('%c[utils.js, _parseServerInfo]', 'color:gray;', 'Parsing server info:', $root);

    this.paired = $root.find("PairStatus").text().trim() == 1;
    this.currentGame = parseInt($root.find("currentgame").text().trim(), 10);
    this.appVersion = $root.find("appversion").text().trim();
    this.serverMajorVersion = parseInt(this.appVersion.substring(0, 1), 10);
    this.serverUid = $root.find('uniqueid').text().trim();
    this.hostname = $root.find('hostname').text().trim();

    var externIP = $root.find('ExternalIP').text().trim();
    if (externIP) {
      // New versions of GFE don't have this field, so don't overwrite
      // the one we found via STUN
      this.externalIP = externIP;
    }

    try { //  these aren't critical for functionality, and don't necessarily exist in older GFE versions.
      this.GfeVersion = $root.find('GfeVersion').text().trim();
      this.gputype = $root.find('gputype').text().trim();
      this.numofapps = $root.find('numofapps').text().trim();
      // now for the hard part: parsing the supported streaming
      $root.find('DisplayMode').each(function(index, value) { // for each resolution:FPS object
        var yres = parseInt($(value).find('Height').text());
        var xres = parseInt($(value).find('Width').text());
        var fps = parseInt($(value).find('RefreshRate').text());
        if (!this.supportedDisplayModes[yres + ':' + xres]) {
          this.supportedDisplayModes[yres + ':' + xres] = [];
        }
        if (!this.supportedDisplayModes[yres + ':' + xres].includes(fps)) {
          this.supportedDisplayModes[yres + ':' + xres].push(fps);
        }
      }.bind(this));
    } catch (err) {
      // we don't need this data, so no error handling necessary
    }


    // GFE 2.8 started keeping currentgame set to the last game played. As a result, it no longer
    // has the semantics that its name would indicate. To contain the effects of this change as much
    // as possible, we'll force the current game to zero if the server isn't in a streaming session.
    if (!$root.find("state").text().trim().endsWith("_SERVER_BUSY")) {
      this.currentGame = 0;
    }

    return true;
  },

  getAppById: function(appId) {
    return this.getAppList().then(function(list) {
      var retApp = null;

      list.some(function(app) {
        if (app.id == appId) {
          retApp = app;
          return true;
        }

        return false;
      });

      return retApp;
    });
  },

  getAppByName: function(appName) {
    return this.getAppList().then(function(list) {
      var retApp = null;

      list.some(function(app) {
        if (app.title == appName) {
          retApp = app;
          return true;
        }

        return false;
      });

      return retApp;
    });
  },

  getAppListWithCacheFlush: function() {
    return sendMessage('openUrl', [this._baseUrlHttps + '/applist?' + this._buildUidStr(), this.ppkstr, false]).then(function(ret) {
      $xml = this._parseXML(ret);
      $root = $xml.find("root");

      if ($root.attr("status_code") != 200) {
        // TODO: Bubble up an error here
        console.error('%c[utils.js, utils.js,  getAppListWithCacheFlush]', 'color: gray;', 'Applist request failed', $root.attr("status_code"));
        return [];
      }

      var rootElement = $xml.find("root")[0];
      var appElements = rootElement.getElementsByTagName("App");
      var appList = [];

      for (var i = 0, len = appElements.length; i < len; i++) {
        appList.push({
          title: appElements[i].getElementsByTagName("AppTitle")[0].innerHTML.trim(),
          id: parseInt(appElements[i].getElementsByTagName("ID")[0].innerHTML.trim(), 10)
        });
      }

      this._memCachedApplist = appList;

      return appList;
    }.bind(this));
  },

  getAppList: function() {
    if (this._memCachedApplist) {
      return new Promise(function(resolve, reject) {
        console.log('%c[utils.js, utils.js]', 'color: gray;', 'Returning memory-cached apps list');
        resolve(this._memCachedApplist);
        return;
      }.bind(this));
    }

    return this.getAppListWithCacheFlush();
  },

  // returns the box art of the given appID.
  // three layers of response time are possible: memory cached (in javascript), storage cached (in chrome.storage.local), and streamed (host sends binary over the network)
  getBoxArt: function(appId) {
    if (chrome.storage) {
      // This may be bad practice to push/pull this much data through local storage?
      return new Promise(function(resolve, reject) {
        chrome.storage.local.get('boxart-' + appId, function(storageData) {
          // if we already have it, load it.
          if (storageData !== undefined && Object.keys(storageData).length !== 0 && storageData['boxart-' + appId].constructor !== Object) {
            console.log('%c[utils.js, getBoxArt]', 'color: gray;', 'Returning storage-cached box art for app: ', appId);
            resolve(storageData['boxart-' + appId]);
            return;
          }

          // otherwise, put it in our cache, then return it
          sendMessage('openUrl', [
            this._baseUrlHttps +
            '/appasset?' + this._buildUidStr() +
            '&appid=' + appId +
            '&AssetType=2&AssetIdx=0',
            this.ppkstr,
            true
          ]).then(function(boxArtBuffer) {
            var reader = new FileReader();
            reader.onloadend = function() {
              var obj = {};
              obj['boxart-' + appId] = this.result;
              chrome.storage.local.set(obj, function(onSuccess) {});
              console.log('%c[utils.js, utils.js,  getBoxArt]', 'color: gray;', 'Returning network-fetched box art');
              resolve(this.result);
            }
            reader.readAsDataURL(new Blob([boxArtBuffer], {
              type: "image/png"
            }));
          }.bind(this), function(error) {
            console.error('%c[utils.js, utils.js,  getBoxArt]', 'color: gray;', 'Box-art request failed!', error);
            reject(error);
            return;
          }.bind(this));
        }.bind(this));
      }.bind(this));

    } else { // shouldn't run because we always have chrome.storage, but I'm not going to antagonize other browsers
      console.warn('%c[utils.js, utils.js,  getBoxArt]', 'color: gray;', 'chrome.storage not detected! Box art will not be saved!');
      return sendMessage('openUrl', [
        this._baseUrlHttps +
        '/appasset?' + this._buildUidStr() +
        '&appid=' + appId +
        '&AssetType=2&AssetIdx=0',
        this.ppkstr,
        true
      ]);
    }
  },

  launchApp: function(appId, mode, sops, rikey, rikeyid, localAudio, surroundAudioInfo, gamepadMask) {
    return sendMessage('openUrl', [
      this._baseUrlHttps +
      '/launch?' + this._buildUidStr() +
      '&appid=' + appId +
      '&mode=' + mode +
      '&additionalStates=1&sops=' + sops +
      '&rikey=' + rikey +
      '&rikeyid=' + rikeyid +
      '&localAudioPlayMode=' + localAudio +
      '&surroundAudioInfo=' + surroundAudioInfo +
      '&remoteControllersBitmap=' + gamepadMask +
      '&gcmap=' + gamepadMask,
      this.ppkstr,
      false
    ]);
  },

  resumeApp: function(rikey, rikeyid, surroundAudioInfo) {
    return sendMessage('openUrl', [
      this._baseUrlHttps +
      '/resume?' + this._buildUidStr() +
      '&rikey=' + rikey +
      '&rikeyid=' + rikeyid +
      '&surroundAudioInfo=' + surroundAudioInfo,
      this.ppkstr,
      false
    ]);
  },

  quitApp: function() {
    return sendMessage('openUrl', [this._baseUrlHttps + '/cancel?' + this._buildUidStr(), this.ppkstr,  false])
      // Refresh server info after quitting because it may silently fail if the
      // session belongs to a different client.
      // TODO: We should probably bubble this up to our caller.
      .then(this.refreshServerInfo());
  },

  updateExternalAddressIP4: function() {
    console.log('%c[utils.js, updateExternalAddressIP4]', 'color: gray;', 'Finding external IPv4 address for ' + this.hostname);
    return sendMessage('STUN').then(function(addr) {
      if (addr) {
        this.externalIP = addr
        console.log('%c[utils.js, updateExternalAddressIP4]', 'color: gray;', 'Found external IPv4 address: ' + this.hostname + ' -> ' + this.externalIP);
      } else {
        console.log('%c[utils.js, updateExternalAddressIP4]', 'color: gray;', 'External IPv4 address lookup failed');
      }
    }.bind(this))
  },

  pair: function(randomNumber) {
    return this.refreshServerInfo().then(function() {
      if (this.paired && this.ppkstr)
        return true;

      return sendMessage('pair', [this.serverMajorVersion.toString(), this.address, randomNumber]).then(function(ppkstr) {
        this.ppkstr = ppkstr;
        return sendMessage('openUrl', [this._baseUrlHttps + '/pair?uniqueid=' + this.clientUid + '&devicename=roth&updateState=1&phrase=pairchallenge', this.ppkstr, false]).then(function(ret) {
          $xml = this._parseXML(ret);
          this.paired = $xml.find('paired').html() == "1";
          return this.paired;
        }.bind(this));
      }.bind(this));
    }.bind(this));
  },

  _buildUidStr: function() {
    return 'uniqueid=' + this.clientUid + '&uuid=' + guuid();
  },

  _parseXML: function(xmlData) {
    return $($.parseXML(xmlData.toString()));
  },
};
