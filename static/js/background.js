var windowState = 'normal';

chrome.app.runtime.onLaunched.addListener(function() {
    if (chrome.storage) {
        // load stored window settings
        chrome.storage.sync.get('windowState', function(item) {
            windowState = (item && item.windowState)
                ? item.windowState
                : windowState;
            createWindow(windowState);
        });
    } else {
        createWindow(windowState);
    }
});

function createWindow(state) {
    chrome.app.window.create('index.html', {
        state: state,
        bounds: {
            width: 960,
            height: 540
        }
    }, function(window) {
        window.onFullscreened.addListener(onFullscreened);
        window.onBoundsChanged.addListener(onBoundsChanged);
    });
}


function onFullscreened() {
    // save windowState: 'fullscreen'
    windowState != 'fullscreen' && saveItem('windowState', 'fullscreen', null);
}

function onBoundsChanged() {
    // save windowState: 'normal'
    windowState != 'normal' && saveItem('windowState', 'normal', null);
}

function saveItem(key, value, callback) {
    var item = { };
    item[key] = value;
    chrome.storage && chrome.storage.sync.set(item, callback);
}