const windowId = "1337";
function createWindow(state) {
  chrome.app.window.create('index.html', {
    state: "normal",
    id: windowId,
  });
}

chrome.app.runtime.onLaunched.addListener(function() {
  console.log('Chrome app runtime launched.');
  var windowState = 'normal';

  if (chrome.storage) {
    // load stored window state
    chrome.storage.sync.get('windowState', function(item) {
      windowState = (item && item.windowState) ?
        item.windowState :
        windowState;
      createWindow(windowState);
    });
  } else {
    createWindow(windowState);
  }
});
