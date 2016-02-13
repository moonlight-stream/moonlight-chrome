function getXMLString(xml, tagName) {
    var xmlDoc = xml.responseXML;
    return xmlDoc.getElementsByTagName(tagName)[0].childNodes[0].nodeValue;
}

function verifyResponseStatus(xml) {
    var responseCode = parseInt(getXMLString(xml, "status_code"));
    if (responseCode !== 200) {
        throw "Error, expected status code 200, received status code: ".concat(responseCode.toString());
    }
}

function getServerInfo() {
    var connectionResp = openHttpConnectionToString(baseUrlHttps + "/serverinfo?"+buildUniqueIdUuidString(), true);
    var serverResp = getServerVersion(connectionResp);

    if(serverResp == 200) {
        return connectionResp;
    } else {
        if(serverResp == 401) {
            return openHttpConnectionToString(baseUrlHttp + "/serverinfo", true);
        }
        throw serverResp
    }
}

function getComputerDetails() {
    var serverInfo = getServerInfo();
    var details = {
        name: getXMLString(serverinfo, "hostname"),
        uuid: UUID.fromString(getXmlString(serverInfo, "uniqueid").trim()),
        macAddress: getXmlString(serverInfo, "mac").trim(),
        localIPStr: getXmlString(serverInfo, "LocalIP"),
        externalIpStr: getXmlString(serverInfo, "ExternalIP"),
        pairState: parseInt(getXmlString(serverInfo, "PairStatus").trim()) == 1 ? PairState.PAIRED : PairState.NOT_PAIRED, // needs support for PiarState.FAILED
        runningGameId: getCurrentGame(serverInfo), // force to 0 if an error happens
        state: ONLINE
    };
    return details;
}

function openHTTPRequest(destinationURL, enableReadTimeout, callbackFunction) {
    var xmlHttp = new XMLHttpRequest();
    if(enableReadTimeout) {
        xmlHttp.timeout = 5000;
    }
    xmlHttp.onreadystatechange = function() {
        callbackFunction(xmlHttp);
        // if (xmlHttp.readyState == 4 && xmlHttp.status == 200) callbackFunction(xmlHttp.responseText);
    }
    xmlHttp.open("GET", theUrl, true); // true for asynchronous 
    xmlHttp.send(null);
}


function getServerVersion(serverInfo) {
    return getXmlString(serverInfo, "appversion");
}

function getPairState() {
    return pm.getPairState(getServerInfo());
}

function getPairState(serverInfo) {
    return pm.getPairState(serverInfo);
}


function getMaxLumaPixelsH264(serverInfo) {
    var str = getXmlString(serverInfo, "MaxLumaPixelsH264");
    if (str !== null) {
        return parseInt(str);
    } else {
        return 0;
    }
}

function getMaxLumaPixelsHEVC(serverInfo) {
    var str = getXmlString(serverInfo, "MaxLumaPixelsHEVC");
    if (str !== null) {
        return parseInt(str);
    } else {
        return 0;
    }
}

function getGpuType(String serverInfo) {
    return getXmlString(serverInfo, "gputype");
}

public boolean supports4K(String serverInfo) throws XmlPullParserException, IOException {
    // serverinfo returns supported resolutions in descending order, so getting the first
    // height will give us whether we support 4K. If this is not present, we don't support
    // 4K.
    var heightStr = getXmlString(serverInfo, "Height");
    if (heightStr == null) {
        return false;
    }
    
    // GFE 2.8 released without 4K support, even though it claims to have such
    // support using the SupportedDisplayMode element. We'll use the new ServerCodecModeSupport
    // element to tell whether 4K is supported or not. For now, we just check the existence
    // of this element. I'm hopeful that the production version that ships with 4K will
    // also be the first production version that has this element.
    if (getXmlString(serverInfo, "ServerCodecModeSupport") == null) {
        return false;
    }
    
    if (parseInt(heightStr) >= 2160) {
        // Found a 4K resolution in the list
        return true;
    }
    return false;
}


function getCurrentGame(String serverInfo) throws IOException, XmlPullParserException {
    // GFE 2.8 started keeping currentgame set to the last game played. As a result, it no longer
    // has the semantics that its name would indicate. To contain the effects of this change as much
    // as possible, we'll force the current game to zero if the server isn't in a streaming session.
    var serverState = getXmlString(serverInfo, "state").trim();
    if (serverState != null && !serverState.match("_SERVER_AVAILABLE" + "$")) {  // an endsWith implementation.
        var game = getXmlString(serverInfo, "currentgame").trim();
        return parseInt(game);
    }
    else {
        return 0;
    }
}

function getAppById(appId) {
    var appList = getAppList();
    for (var i = 0, len = appList.length; i < len; i++) {
        if (appList[i].getAppId() == appId) {
            return appFromList;
        }
    }
    return null;
}

/* NOTE: Only use this function if you know what you're doing.
 * It's totally valid to have two apps named the same thing,
 * or even nothing at all! Look apps up by ID if at all possible
 * using the above function */
function getAppByName(appName) {
    var appList = getAppList();
    for (var i = 0, len = appList.length; i < len; i++) {
        if (appList[i].getAppName().equalsIgnoreCase(appName)) {
            return appList[i];
        }
    }
    return null;
}

function pair(pin) {
    return pm.pair(pin);
}

function getAppListByReader(xml) {
    var rootElement = xml.getElementsByTagName("root")[0];
    var appElements = rootElement.getElementsByTagName("App");
    var returnVar;
    for(var i = 0, len = appElements.length; i < len; i++) {
        returnVar.push(
                var app {
                    appTitle: appElements[i].getElementsByTagName("AppTitle")[0].nodeValue;
                    ID:  appElements[i].getElementsByTagName("ID")[0].nodeValue;
                    isRunning:  appElements[i].getElementsByTagName("IsRunning")[0].nodeValue;
                }
            )
    }
}

function getAppListRaw() {
    return openHttpConnectionToString(baseUrlHttps + "/applist?" + buildUniqueIdUuidString(), true);
}

function getAppList() {
    if (verbose) {
        // Use the raw function so the app list is printed
        return getAppListByReader(new StringReader(getAppListRaw()));
    }
    else {
        var resp = openHttpConnection(baseUrlHttps + "/applist?" + buildUniqueIdUuidString(), true);
        var appList = getAppListByReader(new InputStreamReader(resp.byteStream()));
        resp.close();
        return appList;
    }
}

function unpair() {
    openHttpConnectionToString(baseUrlHttps + "/unpair?"+buildUniqueIdUuidString(), true);
}


function getBoxArt(app) {
    var resp = openHttpConnection(baseUrlHttps + "/appasset?"+ buildUniqueIdUuidString() + "&appid=" + app.getAppId() + "&AssetType=2&AssetIdx=0", true);
    return resp.byteStream();
}


var hexChar = ["0", "1", "2", "3", "4", "5", "6", "7","8", "9", "A", "B", "C", "D", "E", "F"];
function byteToHex(b) { // thanks, https://gist.github.com/amorri40/3430429
    if (b.constructor === Array) { // if we were given an array, then return an array.
        var returnVar;
        for(var i = 0, len = b.length; i < len; i++) {
            returnVar.push(hexChar[(b[i] >> 4) & 0x0f] + hexChar[b[i] & 0x0f]);
        }
        return returnVar;
    }
  return hexChar[(b >> 4) & 0x0f] + hexChar[b & 0x0f];
}

function launchApp(context, appId){
    var xmlStr = openHttpConnectionToString(baseUrlHttps +
        "/launch?" + buildUniqueIdUuidString() +
        "&appid=" + appId +
        "&mode=" + context.negotiatedWidth + "x" + context.negotiatedHeight + "x" + context.negotiatedFps +
        "&additionalStates=1&sops=" + (context.streamConfig.getSops() ? 1 : 0) +
        "&rikey="+bytesToHex(context.riKey.getEncoded()) +
        "&rikeyid="+context.riKeyId +
        "&localAudioPlayMode=" + (context.streamConfig.getPlayLocalAudio() ? 1 : 0) +
        "&surroundAudioInfo=" + ((context.streamConfig.getAudioChannelMask() << 16) + context.streamConfig.getAudioChannelCount()),
        false);
    var gameSession = getXmlString(xmlStr, "gamesession");
    return gameSession != null && !gameSession.equals("0");
}

function resumeApp(context) {
    var xmlStr = openHttpConnectionToString(baseUrlHttps + "/resume?" + buildUniqueIdUuidString() +
            "&rikey="+bytesToHex(context.riKey.getEncoded()) +
            "&rikeyid="+context.riKeyId, false);
    var resume = getXmlString(xmlStr, "resume");
    return parseInt(resume) != 0;
}

function quitApp() {
    var xmlStr = openHttpConnectionToString(baseUrlHttps + "/cancel?" + buildUniqueIdUuidString(), false);
    var cancel = getXmlString(xmlStr, "cancel");
    return parseInt(cancel) != 0;
}


