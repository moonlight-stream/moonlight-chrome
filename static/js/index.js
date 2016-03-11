var target = "";
var hosts = [];
var pairingCert;
var myUniqueid;

// Called by the common.js module.
function attachListeners() {
    $('#startButton').on('click', startPushed);
    $('#stopButton').on('click', stopPushed);
    $('#pairButton').on('click', pairPushed);
    $('#showAppsButton').on('click', showAppsPushed);
    $('#selectResolution').on('change', saveResolution);
    $('#selectFramerate').on('change', saveFramerate);
    $('#bitrateSlider').on('input', updateBitrateField); // input occurs every notch you slide
    $('#bitrateSlider').on('change', saveBitrate); // change occurs once the mouse lets go.
    $(window).resize(fullscreenNaclModule);
}

function updateBitrateField() {
    $('#bitrateField').html($('#bitrateSlider')[0].value + " Mbps");
}

function moduleDidLoad() {
    console.log("NaCl module loaded.");

    if(!pairingCert) { // we couldn't load a cert. Make one.
        console.log("Failed to load local cert. Generating new one");   
        sendMessage('makeCert', []).then(function (cert) {
            storeData('cert', cert, null);
            pairingCert = cert;
            console.log("Generated new cert.")
        });
    }
    if(!myUniqueid) {
        console.log("Failed to get uniqueId.  Generating new one");
        myUniqueid = uniqueid();
        storeData('uniqueid', myUniqueid, null);
    }
}

// we want the user to progress through the streaming process
// but to save from the PITA of inter-chrome-app-page JS message passing,
// I'm opting to do it in a single page, and keep the data around.
function hideAllWorkflowDivs() {
    $('#streamSettings').css('display', 'inline-block');
    $('#hostSettings').css('display', 'inline-block');
    $('#gameSelection').css('display', 'none');
    // common.hideModule(); // do NOT hide the nacl module. you can't interact with it then
}

// pair button was pushed. pass what the user entered into the GFEHostIPField.
function pairPushed() {
    if(!pairingCert) {
        console.log("User wants to pair, and we still have no cert. Problem = very yes.")
        return;
    }
    target = $('#GFEHostIPField')[0].value;
    if (target == null || target == "") {
        var e = $("#selectHost")[0];
        target = e.options[e.selectedIndex].value;
    }
    console.log("Attempting to pair to: " + target);
    sendMessage('httpInit', [pairingCert.cert, pairingCert.privateKey, myUniqueid]).then(function (ret) {
        console.log('httpInit function completed. it returned: ' + ret);
        sendMessage('pair', [target, "1233"]).then(function (ret2) {
            console.log("pair attempt to to " + target + " has returned.");
            console.log("pairing attempt returned: " + ret2);
        })
    });
}

// someone pushed the "show apps" button. 
// if they entered something in the GFEHostIPField, use that.
// otherwise, we assume they selected from the host history dropdown.
function showAppsPushed() {
    target = $('#GFEHostIPField')[0].value;
    if (target == null || target == "") {
        var e = $("#selectHost")[0];
        target = e.options[e.selectedIndex].value;
    }
    // we just finished the hostSettings section. expose the next one
    showAppsMode();
}

function showAppsMode() {
    console.log("entering show apps mode.");
    $('#streamSettings').css('display', 'none');
    $('#hostSettings').css('display', 'none');
    $('#gameSelection').css('display', 'inline-block');
    $("#main-content").children().not("#listener").css('display', 'inline-block');
    $("body").css('backgroundColor', 'white');
}

// user wants to start a stream.  We need the host, game ID, and video settings(?)
function startPushed() {
    target = $('#GFEHostIPField')[0].value;
    if (target == null || target == "") {
        var e = document.getElementById("selectHost");
        target = e.options[e.selectedIndex].value;
    }
    
    var frameRate = $("#selectFramerate").val();
    var streamWidth = $('#selectResolution option:selected').val().split(':')[0];
    var streamHeight = $('#selectResolution option:selected').val().split(':')[1];
    // we told the user it was in Mbps. We're dirty liars and use Kbps behind their back.
    var bitrate = parseInt($("#bitrateSlider").val()) * 1024;
    
    console.log('startRequest:' + target + ":" + streamWidth + ":" + streamHeight + ":" + frameRate + ":" + bitrate);

    sendMessage('httpInit', [pairingCert.cert, pairingCert.privateKey, myUniqueid]).then(function (ret) {
        api = new NvHTTP(target, myUniqueid);
        api.init().then(function (ret) {
            if (api.currentGame != 0) {
                api.resumeApp('00000000000000000000000000000000', 0).then(function (ret) {
                    sendMessage('startRequest', [target, streamWidth, streamHeight, frameRate, bitrate.toString()]);
                });
            }
        });
    });
    
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
    var streamWidth = $('#selectResolution option:selected').val().split(':')[0];
    var streamHeight = $('#selectResolution option:selected').val().split(':')[1];
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
    //common.naclModule.postMessage('stopRequested');
    sendMessage('stopRequested');
}

function storeData(key, data, callbackFunction) {
    var obj = {};
    obj[key] = data;
    if(chrome.storage)
        chrome.storage.sync.set(obj, callbackFunction);
}

function saveResolution() {
    updateDefaultBitrate();
    storeData('resolution', $('#selectResolution').val(), null);
}

function saveFramerate() {
    updateDefaultBitrate();
    storeData('frameRate', $('#selectFramerate').val(), null);
}

function saveHosts() {
    storeData('hosts', hosts, null);
}

function saveBitrate() {
    storeData('bitrate', $('#bitrateSlider').val(), null);
}

function updateDefaultBitrate() {
    var res = $('#selectResolution').val();
    var frameRate = $('#selectFramerate').val();

    if (res.lastIndexOf("1920:1080", 0) === 0) {
        if (frameRate.lastIndexOf("30", 0) === 0) { // 1080p, 30fps
            $('#bitrateSlider')[0].MaterialSlider.change('10');
        } else { // 1080p, 60fps
            $('#bitrateSlider')[0].MaterialSlider.change('20');
        }
    } else if (res.lastIndexOf("1280:720") === 0) {
        if (frameRate.lastIndexOf("30", 0) === 0) { // 720, 30fps
            $('#bitrateSlider')[0].MaterialSlider.change('5');
        } else { // 720, 60fps
            $('#bitrateSlider')[0].MaterialSlider.change('10');
        }
    }
    updateBitrateField();
    saveBitrate();
}

function onWindowLoad(){
    // don't show the game selection div
    $('#gameSelection').css('display', 'none');
    $("#bitrateField").addClass("bitrateField");
    
    if(chrome.storage) {
        // load stored resolution prefs
        chrome.storage.sync.get('resolution', function(previousValue) {
            $('#selectResolution')[0].remove(0);
            $('#selectResolution')[0].value = previousValue.resolution != null ? previousValue.resolution : '1280:720';
        });
        // load stored framerate prefs
        chrome.storage.sync.get('frameRate', function(previousValue) {
            $('#selectFramerate')[0].remove(0);
            $('#selectFramerate')[0].value = previousValue.frameRate != null ? previousValue.frameRate : '30';
        });
        // load previously connected hosts
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
        // load stored bitrate prefs
        chrome.storage.sync.get('bitrate', function(previousValue) {
            $('#bitrateSlider')[0].MaterialSlider.change(previousValue.bitrate != null ? previousValue.bitrate : '15');
            updateBitrateField();
        });
        // load the HTTP cert if we have one.
        chrome.storage.sync.get('cert', function(savedCert) {
            if (savedCert.cert != null) { // we have a saved cert
                pairingCert = savedCert.cert;
            }
        });
        chrome.storage.sync.get('uniqueid', function(savedUniqueid) {
            if (savedUniqueid.uniqueid != null) { // we have a saved uniqueid
                myUniqueid = savedUniqueid.uniqueid;
            }
        })
    }
}


window.onload = onWindowLoad;

