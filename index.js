// Called by the common.js module.
function attachListeners() {
    document.getElementById('startButton').addEventListener('click', startPushed);
    document.getElementById('stopButton').addEventListener('click', stopPushed);
    document.getElementById('pairButton').addEventListener('click', pairPushed);
    document.getElementById('showAppsButton').addEventListener('click', showAppsPushed);
}

function pairPushed() {
    common.naclModule.postMessage('pair:' + document.getElementById('GFEHostIPField').value);
}

function showAppsPushed() {
    common.naclModule.postMessage('showAppsPushed');
    document.getElementById("gameSelectionDiv").style.display = "visible";
}

function startPushed() {
    common.naclModule.postMessage('setGFEHostIPField:' + document.getElementById('GFEHostIPField').value);
}

function stopPushed() {
    common.naclModule.postMessage('stopPushed');
}

// hook from main.cpp into the javascript
function handleMessage(msg) {
    var logEl = document.getElementById('GFEHostIPField');
    logEl.value = msg.data;
}
