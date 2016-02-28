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
    
    getBoxArt: function (appId) {
        return sendMessage('openUrl', [
            _self._baseUrlHttps+
            '/appasset?'+_self._buildUidStr()+
            '&appid=' + appId + 
            '&AssetType=2&AssetIdx=0'
        ]).then(function(ret) {
            return ret;
        });
    },
    
    launchApp: function (context, appId, mode, sops, rikey, rikeyid, localAudio, surroundAudioInfo) {
        return sendMessage('openUrl', [
            _self.baseUrlHttps +
            '/launch?' + _self._buildUidStr() +
            '&appid=' + appId +
            '&mode=' + mode +
            '&additionalStates=1&sops=' + sops +
            '&rikey=' + rikey +
            '&rikeyid=' + rikeyid +
            '&localAudioPlayMode=' + localAudio +
            '&surroundAudioInfo=' + suroundAudioInfo
        ]).then(function (ret) {
            return true;
        });
    },
    
    resumeApp: function (context, rikey, rikeyid) {
        return sendMessage('openUrl', [
            _self._baseUrlHttps +
            '/resume?' + _self._buildUidStr() +
            '&rikey=' + rikey +
            '&rikeyid=' + rikeyid
        ]).then(function (ret) {
            return true;
        });
    },
    
    quitApp: function () {
        return sendMessage('openUrl', [_self._baseUrlHttps+'/cancel?'+_self._buildUidStr()]);
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
