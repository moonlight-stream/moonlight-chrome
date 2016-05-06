chrome.app.runtime.onLaunched.addListener(function() {
    chrome.app.window.create('index.html', {
        state: "normal",
        bounds: { 
    		width: 850, height: 500
    	}
    });
});