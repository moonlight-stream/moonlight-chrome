// Called by the common.js module.
function attachListeners() {
    document.getElementById('startButton').addEventListener('click', startPushed);
    document.getElementById('stopButton').addEventListener('click', stopPushed);
    document.getElementById('pairButton').addEventListener('click', pairPushed);
    document.getElementById('showAppsButton').addEventListener('click', showAppsPushed);
    window.addEventListener("resize", fullscreenNaclModule);
}

function moduleDidLoad() {
    var logEl = document.getElementById('logField');
    logEl.innerHTML = "module loaded";
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
    var target = document.getElementById('GFEHostIPField').value;
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
    var target = document.getElementById('GFEHostIPField').value;
    if (target == null || target == "127.0.0.1") {
        var e = document.getElementById("selectHost");
        target = e.options[e.selectedIndex].value;
    }
    common.naclModule.postMessage('startRequest:' + target);
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
    var logEl = document.getElementById('logField');
    logEl.innerHTML = msg.data;
    console.log("message received: " + msg.data);
    if (msg.data.lastIndexOf(quitStreamString, 0) === 0) {
        console.log("Stream termination message received. returning to 'show apps' screen.")
        showAppsMode();
    }
}

