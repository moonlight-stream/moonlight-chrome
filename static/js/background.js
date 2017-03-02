function createWindow(state) {
    chrome.app.window.create('index.html', {
        state: state,
        bounds: {
            width: 960,
            height: 540
        }
    }, function(window) {
        // workaround:
        // state = 'normal' in some cases not work (e.g. starting app from 'chrome://extensions' always open window in fullscreen mode)
        // it requires manually restoring window state to 'normal'
        if (state == 'normal') {
            setTimeout(function() { window.restore(); }, 1000);
        }
    });
}

chrome.app.runtime.onLaunched.addListener(function() {
    console.log('Chrome app runtime launched.');
    var windowState = 'normal';

    if (chrome.storage) {
        // load stored window state
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
