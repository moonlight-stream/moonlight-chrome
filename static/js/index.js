var target = "";
var hosts = [];

// Called by the common.js module.
function attachListeners() {
    $('#startButton')[0].addEventListener('click', startPushed);
    $('#stopButton')[0].addEventListener('click', stopPushed);
    $('#pairButton')[0].addEventListener('click', pairPushed);
    $('#showAppsButton')[0].addEventListener('click', showAppsPushed);
    $('#selectResolution')[0].addEventListener('change', saveResolution);
    $('#selectFramerate')[0].addEventListener('change', saveFramerate);
    $('#bitrateSlider')[0].addEventListener('input', updateBitrateField); // input occurs every notch you slide
    $('#bitrateSlider')[0].addEventListener('change', saveBitrate); // change occurs once the mouse lets go.
    window.addEventListener("resize", fullscreenNaclModule);
}

function updateBitrateField() {
    $('#bitrateField')[0].innerHTML = $('#bitrateSlider')[0].value + " Mbps"
}

function moduleDidLoad() {
    console.log("NaCl module loaded.");
}

// we want the user to progress through the streaming process
// but to save from the PITA of inter-chrome-app-page JS message passing,
// I'm opting to do it in a single page, and keep the data around.
function hideAllWorkflowDivs() {
    $('#streamSettings')[0].style.display = 'inline-block';
    $('#hostSettings')[0].style.display = 'inline-block';
    $('#gameSelection')[0].style.display = 'none';
    // common.hideModule(); // do NOT hide the nacl module. you can't interact with it then
}

// pair button was pushed. pass what the user entered into the GFEHostIPField.
function pairPushed() {
    console.log("Error. pairing unimplemented.");
}

// someone pushed the "show apps" button. 
// if they entered something in the GFEHostIPField, use that.
// otherwise, we assume they selected from the host history dropdown.
function showAppsPushed() {
    target = $('#GFEHostIPField')[0].value;
    if (target == null || target == "127.0.0.1") {
        var e = $("#selectHost")[0];
        target = e.options[e.selectedIndex].value;
    }
    // we just finished the hostSettings section. expose the next one
    showAppsMode();
}

function showAppsMode() {
    console.log("entering show apps mode.")
    $('#streamSettings')[0].style.display = 'none';
    $('#hostSettings')[0].style.display = 'none';
    $('#gameSelection')[0].style.display = 'inline-block';
    $("#main-content").children().not("#listener").display = "inline-block";
    document.body.style.backgroundColor = "white";
}

// user wants to start a stream.  We need the host, game ID, and video settings(?)
function startPushed() {
    target = $('#GFEHostIPField')[0].value;
    if (target == null || target == "127.0.0.1" || target == "") {
        var e = document.getElementById("selectHost");
        target = e.options[e.selectedIndex].value;
    }
    var frameRate = $("#selectFramerate")[0].value;
    var resolution = $("#selectResolution")[0].value;
    // we told the user it was in Mbps. We're dirty liars and use Kbps behind their back.
    var bitrate = parseInt($("#bitrateSlider")[0].value) * 1024;
    console.log('startRequest:' + target + ":" + resolution + ":" + frameRate);
    common.naclModule.postMessage('startRequest:' + target + ":" + resolution + ":" + frameRate + ":" + bitrate + ":");
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
    var streamWidth = $('#selectResolution')[0].options[$('#selectResolution')[0].selectedIndex].value.split(':')[0];
    var streamHeight = $('#selectResolution')[0].options[$('#selectResolution')[0].selectedIndex].value.split(':')[1];
    var screenWidth = window.innerWidth;
    var screenHeight = window.innerHeight;

    var xRatio = screenWidth / streamWidth;
    var yRatio = screenHeight / streamHeight;

    var zoom = Math.min(xRatio, yRatio);

    var module = $("#nacl_module")[0];
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
        var hostSelect = $('#selectHost')[0];
        for(var i = 0; i < hostSelect.length; i++) {
            if (hostSelect.options[i].value == target) return;
        }

        var opt = $('#option')[0];
        opt.appendChild(document.createTextNode(target));
        opt.value = target;
        $('#selectHost')[0].appendChild(opt);
        hosts.push(target);
        saveHosts();
    }
}

function storeData(key, data, callbackFunction) {
    var obj = {};
    obj[key] = data;
    chrome.storage.sync.set(obj, callbackFunction);
}

function saveResolution() {
    storeData('resolution', $('#selectResolution')[0].value, null);
}

function saveFramerate() {
    storeData('frameRate', $('#selectFramerate')[0].value, null);
}

function saveHosts() {
    storeData('hosts', hosts, null);
}

function saveBitrate() {
    storeData('bitrate', $('#bitrateSlider')[0].value, null);
}

function onWindowLoad(){
    document.getElementById('gameSelection').style.display = 'none';
    $("#bitrateField").addClass("bitrateField");
    chrome.storage.sync.get('resolution', function(previousValue) {
        $('#selectResolution')[0].remove(0);
        $('#selectResolution')[0].value = previousValue.resolution != null ? previousValue.resolution : '1280:720';
    });
    chrome.storage.sync.get('frameRate', function(previousValue) {
        $('#selectFramerate')[0].remove(0);
        $('#selectFramerate')[0].value = previousValue.frameRate != null ? previousValue.frameRate : '30';
    });
    chrome.storage.sync.get('hosts', function(previousValue) {
        hosts = previousValue.hosts != null ? previousValue.hosts : [];
        if ($('#selectHost')[0].length > 0) {
            $('#selectHost')[0].remove($('#selectHost')[0].selectedIndex);
        }
        for(var i = 0; i < hosts.length; i++) { // programmatically add each new host.
            var opt = document.createElement('option');
            opt.appendChild(document.createTextNode(hosts[i]));
            opt.value = hosts[i];
            $('#selectHost')[0].appendChild(opt);
        }
    });

    chrome.storage.sync.get('hosts', function(previousValue) {
        $('#bitrateSlider')[0].MaterialSlider.change(previousValue.bitrate != null ? previousValue.bitrate : '15');
        updateBitrateField();
    });
}


window.onload = onWindowLoad;

