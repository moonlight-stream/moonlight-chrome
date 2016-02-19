var target = "";
var hosts = [];

// Called by the common.js module.
function attachListeners() {
    document.getElementById('startButton').addEventListener('click', startPushed);
    document.getElementById('stopButton').addEventListener('click', stopPushed);
    document.getElementById('pairButton').addEventListener('click', pairPushed);
    document.getElementById('showAppsButton').addEventListener('click', showAppsPushed);
    document.getElementById('selectResolution').addEventListener('change', saveResolution);
    document.getElementById('selectFramerate').addEventListener('change', saveFramerate);
    window.addEventListener("resize", fullscreenNaclModule);
}

function moduleDidLoad() {
    console.log("NaCl module loaded.");
}

// we want the user to progress through the streaming process
// but to save from the PITA of inter-chrome-app-page JS message passing,
// I'm opting to do it in a single page, and keep the data around.
function hideAllWorkflowDivs() {
    document.getElementById('streamSettings').style.display = 'inline-block';
    document.getElementById('hostSettings').style.display = 'inline-block';
    document.getElementById('gameSelection').style.display = 'none';
    // common.hideModule(); // do NOT hide the nacl module. you can't interact with it then
}

// pair button was pushed. pass what the user entered into the GFEHostIPField.
function pairPushed() {

}

// someone pushed the "show apps" button. 
// if they entered something in the GFEHostIPField, use that.
// otherwise, we assume they selected from the host history dropdown.
// TODO: pass the host info to the appChoose screen
function showAppsPushed() {
    target = document.getElementById('GFEHostIPField').value;
    if (target == null || target == "127.0.0.1") {
        var e = document.getElementById("selectHost");
        target = e.options[e.selectedIndex].value;
    }
    // we just finished the hostSettings section. expose the next one
    showAppsMode();
}

function showAppsMode() {
    console.log("entering show apps mode.")
    document.getElementById('streamSettings').style.display = 'none';
    document.getElementById('hostSettings').style.display = 'none';
    document.getElementById('gameSelection').style.display = 'inline-block';
    $("#main-content").children().not("#listener").display = "inline-block";
    document.body.style.backgroundColor = "white";
    // common.hideModule(); // do NOT hide the nacl module. you can't interact with it then
}

// user wants to start a stream.  We need the host, game ID, and video settings(?)
// TODO: video settings.
function startPushed() {
    target = document.getElementById('GFEHostIPField').value;
    if (target == null || target == "127.0.0.1" || target == "") {
        var e = document.getElementById("selectHost");
        target = e.options[e.selectedIndex].value;
    }
    var frameRate = document.getElementById('selectFramerate').value;
    var resolution = document.getElementById('selectResolution').value;
    console.log('startRequest:' + target + ":" + resolution + ":" + frameRate);
    common.naclModule.postMessage('startRequest:' + target + ":" + resolution + ":" + frameRate + ":");
    // we just finished the gameSelection section. only expose the NaCl section
    playGameMode();
}

function playGameMode() {
    $(".mdl-layout__header").hide();
    $("#main-content").children().not("#listener").hide();
    $("#main-content").addClass("fullscreen");
    $("#listener").addClass("fullscreen");
    fullscreenNaclModule();
    document.body.style.backgroundColor = "black";
}

function fullscreenNaclModule() {
    var streamWidth = 1280; // TODO: once stream size is selectable, use those variables
    var streamHeight = 720;
    var screenWidth = window.innerWidth;
    var screenHeight = window.innerHeight;

    var xRatio = screenWidth / streamWidth;
    var yRatio = screenHeight / streamHeight;

    var zoom = Math.min(xRatio, yRatio);

    var module = document.getElementById("nacl_module");
    module.width=zoom * streamWidth;
    module.height=zoom * streamHeight;
    module.style.paddingTop = ((screenHeight - module.height) / 2) + "px";
}

// user pushed the stop button. we should stop.
function stopPushed() {
    common.naclModule.postMessage('stopRequested');
}

// hook from main.cpp into the javascript
function handleMessage(msg) {
    var quitStreamString = "streamTerminated";
    var connectionEstablishedString = "Connection Established";
    console.log("message received: " + msg.data);
    if (msg.data.lastIndexOf(quitStreamString, 0) === 0) {
        console.log("Stream termination message received. returning to 'show apps' screen.")
        showAppsMode();
    } else if (msg.data.lastIndexOf(connectionEstablishedString, 0) === 0) {
        var hostSelect = document.getElementById('selectHost');
        for(var i = 0; i < hostSelect.length; i++) {
            if (hostSelect.options[i].value == target) return;
        }

        var opt = document.createElement('option');
        opt.appendChild(document.createTextNode(target));
        opt.value = target;
        document.getElementById('selectHost').appendChild(opt);
        hosts.push(target);
        saveHosts();
    }
}

function storeData(key, data, callbackFunction) {
    var obj = {};
    obj[key] = data;
    chrome.storage.sync.set(obj, callbackFunction);
}

function readData(key, callbackFunction) {
    chrome.storage.sync.get(key, callbackFunction);
}

function loadResolution(previousValue) {
    document.getElementById('selectResolution').value = previousValue.resolution != null ? previousValue.resolution : '1280:720';
}

function saveResolution() {
    storeData('resolution', document.getElementById('selectResolution').value, null);
}

function loadFramerate(previousValue) {
    document.getElementById('selectFramerate').value = previousValue.frameRate != null ? previousValue.frameRate : '30';
}

function saveFramerate() {
    storeData('frameRate', document.getElementById('selectFramerate').value, null);
}

function saveHosts() {
    storeData('hosts', hosts, null);
}

function loadHosts(previousValue) {
    hosts = previousValue.hosts != null ? previousValue.hosts : [];
    if (document.getElementById('selectHost').length > 0) {
        document.getElementById('selectHost').remove(document.getElementById('selectHost').selectedIndex);
    }
    for(var i = 0; i < hosts.length; i++) { // programmatically add each new host.
        var opt = document.createElement('option');
        opt.appendChild(document.createTextNode(hosts[i]));
        opt.value = hosts[i];
        document.getElementById('selectHost').appendChild(opt);
    }
}

function onWindowLoad(){
    // document.getElementById('streamSettings').style.display = 'none';
    document.getElementById('gameSelection').style.display = 'none';
    readData('resolution', loadResolution);
    readData('frameRate', loadFramerate);
    readData('hosts', loadHosts);
}

window.onload = onWindowLoad;

