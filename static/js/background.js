// just start the app in fullscreen
chrome.app.runtime.onLaunched.addListener(function() {
    chrome.app.window.create('index.html', {
        state: "normal",
        bounds: { 
    		width: 770, height: 440
    	}
    });
});