function guuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
        return v.toString(16);
    });
}

function uniqueid() {
    return 'xxxxxxxxxxxxxxxx'.replace(/[x]/g, function(c) {
        var r = Math.random()*16|0;
        return r.toString(16);
    });
}

function generateRemoteInputKey() {
    return 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'.replace(/[x]/g, function(c) {
        var r = Math.random()*16|0;
        return r.toString(16);
    });
}

function generateRemoteInputKeyId() {
    return ((Math.random()-0.5) * 0x7FFFFFFF)|0;
}

String.prototype.toHex = function() {
    var hex = '';
    for(var i = 0; i < this.length; i++) {
        hex += '' + this.charCodeAt(i).toString(16);
    }
    return hex;
}

function _arrayBufferToBase64( buffer ) {
    var binary = '';
    var bytes = new Uint8Array( buffer );
    var len = bytes.byteLength;
    for (var i = 0; i < len; i++) {
        binary += String.fromCharCode( bytes[ i ] );
    }
    return window.btoa( binary );
}

function _base64ToArrayBuffer(base64) {
    var binary_string =  window.atob(base64);
    var len = binary_string.length;
    var bytes = new Uint8Array( len );
    for (var i = 0; i < len; i++) {
        bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
}


function NvHTTP(address, clientUid, userEnteredAddress = '') {
    this.address = address;
    this.paired = false;
    this.currentGame = 0;
    this.serverMajorVersion = 0;
    this.clientUid = clientUid;
    this._memCachedBoxArtArray = {};
    this._pollCount = 0;
    this._consecutivePollFailures = 0;
    this.online = false;

    this.userEnteredAddress = userEnteredAddress;  // if the user entered an address, we keep it on hand to try when polling
    this.serverUid = '';
    this.GfeVersion = '';
    this.supportedDisplayModes = {}; // key: y-resolution:x-resolution, value: array of supported framerates (only ever seen 30 or 60, here)
    this.gputype = '';
    this.numofapps = 0;
    this.hostname = '';
    this.externalIP = '';
    this._baseUrlHttps = 'https://' + address + ':47984';
    this._baseUrlHttp = 'http://' + address + ':47989';
};

NvHTTP.prototype = {
    refreshServerInfo: function () {
        console.log(this.address + ' refreshServerInfo');
        
        return new Promise(function (resolve, reject) {
            sendMessage('openUrl', [ this._baseUrlHttps + '/serverinfo?' + this._buildUidStr(), false]).then(function(ret) {
                if (!this._parseServerInfo(ret)) {
                    sendMessage('openUrl', [ this._baseUrlHttp + '/serverinfo?' + this._buildUidStr(), false]).then(function(retHttp) {
                        resolve(this._parseServerInfo(retHttp));
                    }.bind(this), function () {
                        resolve(false);
                    });
                }
                else {
                    resolve(true);
                }
            }.bind(this), function () {
                resolve(false);
            });
        }.bind(this));
    },

    toString: function() {
        var string = '';
        string += 'server address: ' + this.address + '\r\n';
        string += 'server UID: ' + this.serverUid + '\r\n';
        string += 'is paired: ' + this.paired + '\r\n';
        string += 'current game: ' + this.currentGame + '\r\n';
        string += 'server major version: ' + this.serverMajorVersion + '\r\n';
        string += 'GFE version: ' + this.GfeVersion + '\r\n';
        string += 'gpu type: ' + this.gputype + '\r\n';
        string += 'number of apps: ' + this.numofapps + '\r\n';
        string += 'supported display modes: ' + '\r\n';
        for(displayMode in this.supportedDisplayModes) {
            string += '\t' + displayMode + ': ' + this.supportedDisplayModes[displayMode] + '\r\n';
        }
        return string;
    },

    _prepareForStorage: function() {
        this._memCachedBoxArtArray = {};
    },
    
    _parseServerInfo: function(xmlStr) {
        $xml = this._parseXML(xmlStr);
        $root = $xml.find('root');

        if($root.attr('status_code') != 200) {
            return false;
        }

        if(this.serverUid != $root.find('uniqueid').text().trim() && this.serverUid != '') {
            // if we received a UID that isn't the one we expected, fail.
            return false;
        }
        
        //console.log('parsing server info: ');
        //console.log($root);

        this.paired = $root.find('PairStatus').text().trim() == 1;
        this.currentGame = parseInt($root.find('currentgame').text().trim(), 10);
        this.serverMajorVersion = parseInt($root.find('appversion').text().trim().substring(0, 1), 10);
        this.serverUid = $root.find('uniqueid').text().trim();
        this.hostname = $root.find('hostname').text().trim();
        this.externalIP = $root.find('ExternalIP').text().trim();
        
        //  these aren't critical for functionality, and don't necessarily exist in older GFE versions.
        try {  
            this.GfeVersion = $root.find('GfeVersion').text().trim();
            this.gputype = $root.find('gputype').text().trim();
            this.numofapps = $root.find('numofapps').text().trim();
            
            // now for the hard part: parsing the supported streaming
            $root.find('DisplayMode').each(function(index, value) {  // for each resolution:FPS object
                var yres = parseInt($(value).find('Height').text());
                var xres = parseInt($(value).find('Width').text());
                var fps = parseInt($(value).find('RefreshRate').text());
                if(!this.supportedDisplayModes[yres + ':' + xres]) {
                    this.supportedDisplayModes[yres + ':' + xres] = [];
                }
                if(!this.supportedDisplayModes[yres + ':' + xres].includes(fps)) {
                    this.supportedDisplayModes[yres + ':' + xres].push(fps);
                }
            });
        }
        catch (err) {
            // we don't need this data, so no error handling necessary
        }
        
        // GFE 2.8 started keeping currentgame set to the last game played. As a result, it no longer
        // has the semantics that its name would indicate. To contain the effects of this change as much
        // as possible, we'll force the current game to zero if the server isn't in a streaming session.
        if ($root.find('state').text().trim().endsWith('_SERVER_AVAILABLE')) {
            this.currentGame = 0;
        }
        
        return true;
    },
    
    getAppById: function (appId) {
        console.log(this.address + ' getAppById ' + appId);
        
        return this.getAppList().then(function (list) {
            var retApp = null;
            
            list.some(function (app) {
                if (app.id == appId) {
                    retApp = app;
                    return true;
                }
                
                return false;
            });
            
            return retApp;
        });
    },
    
    getAppByName: function (appName) {
        console.log(this.address + ' getAppByName ' + appName);
        
        return this.getAppList().then(function (list) {
            var retApp = null;
            
            list.some(function (app) {
                if (app.title == appName) {
                    retApp = app;
                    return true;
                }
                
                return false;
            });
            
            return retApp;
        });
    },
    
    getAppListWithCacheFlush: function () {
        return sendMessage('openUrl', [this._baseUrlHttps + '/applist?' + this._buildUidStr(), false]).then(function (ret) {
            $xml = this._parseXML(ret);
            
            var rootElement = $xml.find('root')[0];
            var appElements = rootElement.getElementsByTagName('App');
            var appList = [];
            
            for (var i = 0, len = appElements.length; i < len; i++) {
                appList.push({
                    title: appElements[i].getElementsByTagName('AppTitle')[0].innerHTML.trim(),
                    id: parseInt(appElements[i].getElementsByTagName('ID')[0].innerHTML.trim(), 10),
                    running: (appElements[i].getElementsByTagName('IsRunning')[0].innerHTML.trim() == 1)
                });
            }

            this._memCachedApplist = appList;
            
            return appList;
        }.bind(this));
    },

    getAppList: function () {
        console.log(this.address + ' getAppList');
        
        if (this._memCachedApplist) {
            return new Promise(function (resolve, reject) {
                console.log(this.address + ' getAppList Returning memory cached app list');
                resolve(this._memCachedApplist);
                return;
            }.bind(this));
        }

        return this.getAppListWithCacheFlush();
    },
    
    getBoxArt: function (appId) {
        console.log(this.address + ' getBoxArt ' + appId);
        
        return sendMessage('openUrl', [
            this._baseUrlHttps +
            '/appasset?'+this._buildUidStr() +
            '&appid=' + appId + 
            '&AssetType=2&AssetIdx=0',
            true
        ]);
    },
    
    launchApp: function (appId, mode, sops, rikey, rikeyid, localAudio, surroundAudioInfo) {
        console.log(this.address + ' launchApp ' + appId);
        
        return sendMessage('openUrl', [
            this._baseUrlHttps +
            '/launch?' + this._buildUidStr() +
            '&appid=' + appId +
            '&mode=' + mode +
            '&additionalStates=1&sops=' + sops +
            '&rikey=' + rikey +
            '&rikeyid=' + rikeyid +
            '&localAudioPlayMode=' + localAudio +
            '&surroundAudioInfo=' + surroundAudioInfo,
            false
        ]).then(function (ret) {
            return true;
        });
    },
    
    resumeApp: function (rikey, rikeyid) {
        console.log(this.address + ' resumeApp');
        
        return sendMessage('openUrl', [
            this._baseUrlHttps +
            '/resume?' + this._buildUidStr() +
            '&rikey=' + rikey +
            '&rikeyid=' + rikeyid,
            false
        ]).then(function (ret) {
            return true;
        });
    },
    
    quitApp: function () {
        console.log(this.address + ' quitApp');
        
        return sendMessage('openUrl', [this._baseUrlHttps + '/cancel?' + this._buildUidStr(), false]).then(function () {
            this.currentGame = 0;
        }.bind(this));
    },
    
    pair: function(randomNumber) {
        console.log(this.address + ' pair');
        
        return this.refreshServerInfo().then(function () {
            if (this.paired)
                return true;
            
            if (this.currentGame != 0)
                return false;
            
            return sendMessage('pair', [this.serverMajorVersion, this.address, randomNumber]).then(function (pairStatus) {
                return sendMessage('openUrl', [this._baseUrlHttps + '/pair?uniqueid=' + this.clientUid + '&devicename=roth&updateState=1&phrase=pairchallenge', false]).then(function (ret) {
                    $xml = this._parseXML(ret);
                    this.paired = $xml.find('paired').html() == '1';
                    return this.paired;
                }.bind(this));
            }.bind(this));
        }.bind(this));
    },
    
    unpair: function () {
        console.log(this.address + ' unpair');
        
        return sendMessage('openUrl', [this._baseUrlHttps + '/unpair?' + this._buildUidStr(), false]);
    },
    
    _buildUidStr: function () {
        return 'uniqueid=' + this.clientUid + '&uuid=' + guuid();
    },
    
    _parseXML: function (xmlData) {
        return $($.parseXML(xmlData.toString()));
    },
};
