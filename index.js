// Called by the common.js module.
function attachListeners() {
    document.getElementById('startButton').addEventListener('click', startPushed);
    document.getElementById('stopButton').addEventListener('click', stopPushed);
    document.getElementById('pairButton').addEventListener('click', pairPushed);
    document.getElementById('showAppsButton').addEventListener('click', showAppsPushed);
}

function moduleDidLoad() {
    common.naclModule = document.getElementById('nacl_module');
    var logEl = document.getElementById('logField');
    logEl.innerHTML = "module loaded";
}

// we want the user to progress through the streaming process
// but to save from the PITA of inter-chrome-app-page JS message passing,
// I'm opting to 
function hideAllWorkflowDivs() {
    document.getElementById('streamSettings').style.display = 'inline-block';
    document.getElementById('hostSettings').style.display = 'inline-block';
    document.getElementById('gameSelection').style.display = 'none';
    document.getElementById('listener').style.display = 'none';
}

// pair button was pushed. pass what the user entered into the GFEHostIPField.
function pairPushed() {
    common.naclModule.postMessage('pair:' + document.getElementById('GFEHostIPField').value);
}

// someone pushed the "show apps" button. 
// if they entered something in the GFEHostIPField, use that.
// otherwise, we assume they selected from the host history dropdown.
function showAppsPushed() {
    var target = document.getElementById('GFEHostIPField').value;
    if (target == null || target == "127.0.0.1") {
        var e = document.getElementById("selectHost");
        target = e.options[e.selectedIndex].value;
    }
    common.naclModule.postMessage('showAppsPushed:' + target);
    // we just finished the hostSettings section. expose the next one
    document.getElementById('streamSettings').style.display = 'none';
    document.getElementById('hostSettings').style.display = 'none'
    document.getElementById('gameSelection').style.display = 'inline-block'
    document.getElementById('listener').style.display = 'none'
}

// user wants to start a stream.  We need the host, game ID, and video settings(?)
// TODO: video settings.
function startPushed() {
    var target = document.getElementById('GFEHostIPField').value;
    if (target == null || target == "127.0.0.1") {
        var e = document.getElementById("selectHost");
        target = e.options[e.selectedIndex].value;
    }
    var gameIDDropdown = document.getElementById("selectGame");
    var gameID = gameIDDropdown[gameIDDropdown.selectedIndex].value;
    common.naclModule.postMessage('setGFEHostIPField:' + target + ":" + gameID);
    
    // we just finished the gameSelection section. only expose the NaCl section
    document.getElementById('streamSettings').style.display = 'none';
    document.getElementById('hostSettings').style.display = 'none';
    document.getElementById('gameSelection').style.display = 'none'
    document.getElementById('testingDiv').style.display = 'none'
    document.getElementById('listener').style.display = 'inline-block'
    document.getElementById('title').style.display = 'none'
}

// user pushed the stop button. we should stop.
function stopPushed() {
    common.naclModule.postMessage('stopPushed');
}

// hook from main.cpp into the javascript
function handleMessage(msg) {
    var logEl = document.getElementById('logField');
    logEl.innerHTML = msg.data;
}

// window.onload = hideAllWorkflowDivs;
