function guuid() {
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
	    var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
	    return v.toString(16);
	});
}

String.prototype.toHex = function() {
	var hex = '';
	for(var i = 0; i < this.length; i++) {
		hex += '' + this.charCodeAt(i).toString(16);
	}
	return hex;
}

function NvAPI(address, clientUid) {
    this.address = address;
    this.paired = false;
    this.supports4K = false;
    this.currentGame = 0;
    this.serverMajorVersion = 0;
    this.clientUid = clientUid;
    this._baseUrlHttps = 'https://' + address + ':47984';
    this._baseUrlHttp = 'http://' + address + ':47989';
    _self = this;
};

//FOR TEST ONLY
var api;
function init() {
    api = new NvAPI('localhost', guuid());
    return sendMessage('makeCert', []).then(function (cert) {
        return sendMessage('httpInit', [cert.cert, cert.privateKey]).then(function (ret) {
            return api.pair(cert, "1234");
        });
    });
}

NvAPI.prototype = {
    init: function () {
        return sendMessage('openUrl', [_self._baseUrlHttps+'/serverinfo?'+_self._buildUidStr()]).then(function(ret) {
            $xml = _self._parseXML(ret);
            $root = $xml.find('root')
            
            if($root.attr("status_code") == 200) {
                _self.pair = getXMLString(xml, "PairStatus").trim() == 1;
                _self.currentGame = getXMLString(xml, "currentgame").trim();
            }
        });
    },
    
    getAppById: function (appId) {
        return getAppList().then(function (list) {
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
    
    getAppList: function () {
        return sendMessage('openUrl', [_self._baseUrlHttps+'/applist?'+_self._buildUidStr()]).then(function (ret) {
            $xml = _self._parseXML(ret);
            
            var rootElement = xml.getElementsByTagName("root")[0];
            var appElements = rootElement.getElementsByTagName("App");
            var appList;
            
            for(var i = 0, len = appElements.length; i < len; i++) {
                appList.push({
                    title: appElements[i].getElementsByTagName("AppTitle")[0].nodeValue.trim(),
                    id: appElements[i].getElementsByTagName("ID")[0].nodeValue.trim(),
                    running: appElements[i].getElementsByTagName("IsRunning")[0].nodeValue.trim()
                });
            }
            
            return appList;
        });
    },
    
    getArtBox: function (appId) {
        return sendMessage('openUrl', [
            _self._baseUrlHttps+
            '/appasset?'+_self._buildUidStr()+
            '&appid=' + appId + 
            '&AssetType=2&AssetIdx=0'
        ]).then(function(ret) {
            return ret;
        });
    },
    
    launchApp: function (context, appId) {
        return sendMessage('openUrl', [
            _self.baseUrlHttps +
            '/launch?' + _self._buildUidStr() +
            '&appid=' + appId +
            '&mode=' +
            '&additionalStates=1&sops=' + 
            '&rikey' +
            '&rikeyid' + 
            '&localAudioPlayMode' + 
            '&surroundAudioInfo'
        ]).then(function (ret) {
            return true;
        });
    },
    
    resumeApp: function (context) {
        return sendMessage('openUrl', [
            _self._baseUrlHttps +
            '/resume?' + _self._buildUidStr() +
            '&rikey=' +
            '&rikeyid='
        ]).then(function (ret) {
            return true;
        });
    },
    
    quitApp: function () {
        return sendMessage('openUrl', [_self._baseUrlHttps+'/unpair?'+_self._buildUidStr()]);
    },
    
    pair: function (cert, pin) {
        if (_self.paired)
            return $.when(false);
        
        if (_self.currentGame)
            return $.when(false);
        
        var salt_data = CryptoJS.lib.WordArray.random(16);
        var cert_hex = cert.cert.toHex(); 
        
        return sendMessage('openUrl',[
            _self._baseUrlHttp+
            '/pair?'+_self._buildUidStr()+
            '&devicename=roth&updateState=1&phrase=getservercert&salt='+salt_data.toString()+
            '&clientcert='+cert_hex
        ]).then(function (ret) {
            var salt_pin_hex = salt_data.toString();
            var aes_key_hash = CryptoJS.SHA1(CryptoJS.enc.Hex.parse(salt_pin_hex + salt_pin_hex.substr(0, 8)));
            
            console.log(aes_key_hash);
            
            var challenge_data = CryptoJS.lib.WordArray.random(16);
            var challenge_enc = CryptoJS.AES.encrypt(challenge_data, aes_key_hash, {mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.NoPadding});
            var challange_enc_hex = challenge_enc.ciphertext.toString()
            
            return sendMessage('openUrl', [
                _self._baseUrlHttp+
                '/pair?'+_self._buildUidStr()+
                '&devicename=roth&updateState=1&clientchallenge=' + challange_enc_hex
            ]).then(function (ret) {
                console.log(ret);
                
                $xml = _self._parseXML(ret);
                var challengeresponse = $xml.find('challengeresponse').text();
                
                for (var i = 0; i < 96; i += 32) {
                    var data = CryptoJS.enc.Hex.parse(challengeresponse.substr(i, 32));
                    var challenge_dec = CryptoJS.AES.decrypt(data, aes_key_hash, {mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.NoPadding});
                    console.log(challenge_dec);
                }
                
                return sendMessage('openUrl', [
                    _self._baseUrlHttp+
                    '/pair?'+
                    '&devicename=roth&updateState=1&serverchallengeresp='
                ]).then(function (ret) {
                    console.log(ret);
                    
                    return true;
                });
            });
        });
    },
    
    unpair: function () {
        return sendMessage('openUrl', [_self._baseUrlHttps+'/unpair?'+_self._buildUidStr()]);
    },
    
    _buildUidStr: function () {
        return 'uniqueid=' + _self.clientUid + '&uuid=' + guuid();
    },
    
    _parseXML: function (xmlData) {
        return $($.parseXML(xmlData.toString()));
    },
};
