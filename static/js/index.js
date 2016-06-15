var host = "";
var hosts = [];
var pairingCert;
var myUniqueid;
var api;

// Called by the common.js module.
function attachListeners() {
    changeUiModeForNaClLoad();

    $('#selectResolution').on('change', saveResolution);
    $('#selectFramerate').on('change', saveFramerate);
    $('#bitrateSlider').on('input', updateBitrateField); // input occurs every notch you slide
    $('#bitrateSlider').on('change', saveBitrate); // change occurs once the mouse lets go.
    $('#hostChosen').on('click', hostChosen);
    $('#addHostCell').on('click', addHost);
    $('#cancelAddHost').on('click', cancelAddHost);
    $('#continueAddHost').on('click', continueAddHost);
    $('#forgetHost').on('click', forgetHost);
    $('#cancelPairingDialog').on('click', pairingPopupCanceled);
    $('#selectGame').on('change', gameSelectUpdated);
    $('#startGameButton').on('click', startSelectedGame);
    $('#cancelReplaceApp').on('click', cancelReplaceApp);
    $('#continueReplaceApp').on('click', continueReplaceApp);
    $('#quitGameButton').on('click', stopGame);
    $(window).resize(fullscreenNaclModule);
    chrome.app.window.current().onMaximized.addListener(fullscreenChromeWindow);
}

function fullscreenChromeWindow() {
    // when the user clicks the maximize button on the window,
    // FIRST restore it to the previous size, then fullscreen it to the whole screen
    // this prevents the previous window size from being 'maximized',
    // and allows us to functionally retain two window sizes
    // so that when the user hits `esc`, they go back to the "restored" size, 
    // instead of "maximized", which would immediately go to fullscreen
    chrome.app.window.current().restore();
    chrome.app.window.current().fullscreen();
}

function changeUiModeForNaClLoad() {
    $("#main-content").children().not("#listener, #naclSpinner").hide();

    $('#naclSpinnerMessage').text('Loading Moonlight plugin...');
    $('#naclSpinner').css('display', 'inline-block');
}

function restoreUiAfterNaClLoad() {
    $("#main-content").children().not("#listener, #naclSpinner, #gameSelection").show();
    $('#naclSpinner').hide();
    $('#loadingSpinner').css('display', 'none');
}

function snackbarLog(givenMessage) {
    console.log(givenMessage);
    var data = {
      message: givenMessage,
      timeout: 2000
    };
    document.querySelector('#snackbar').MaterialSnackbar.showSnackbar(data);
}

function updateBitrateField() {
    $('#bitrateField').html($('#bitrateSlider').val() + " Mbps");
}

function moduleDidLoad() {
    if(!myUniqueid) {
        console.log("Failed to get uniqueId.  Generating new one");
        myUniqueid = uniqueid();
        storeData('uniqueid', myUniqueid, null);
    }

    if(!pairingCert) { // we couldn't load a cert. Make one.
        console.log("Failed to load local cert. Generating new one");   
        sendMessage('makeCert', []).then(function (cert) {
            storeData('cert', cert, null);
            pairingCert = cert;
            console.log("Generated new cert.");
        }, function (failedCert) {
            console.log('ERROR: failed to generate new cert!');
            console.log('Returned error was: ' + failedCert);            
        }).then(function (ret) {
            sendMessage('httpInit', [pairingCert.cert, pairingCert.privateKey, myUniqueid]).then(function (ret) {
            restoreUiAfterNaClLoad();
        }, function (failedInit) {
            console.log('ERROR: failed httpInit!');
            console.log('Returned error was: ' + failedInit);
        });
        });
    }
    else {
        sendMessage('httpInit', [pairingCert.cert, pairingCert.privateKey, myUniqueid]).then(function (ret) {
            restoreUiAfterNaClLoad();
        }, function (failedInit) {
            console.log('ERROR: failed httpInit!');
            console.log('Returned error was: ' + failedInit);
        });
    }
}

// because the user can change the host at any time, we continually have to check
function updateHost() {
    host = $('#GFEHostIPField').val();
    if (host == null || host == "") {
        host = $("#selectHost option:selected").val();
    }
    
    if(api && api.address != host) {
        api = new NvHTTP(host, myUniqueid);
    }
}

// pair to the given hostname or IP.  Returns whether pairing was successful.
function pairTo(host, onSuccess, onFailure) {
    if(!pairingCert) {
        snackbarLog('ERROR: cert has not been generated yet. Is NaCl initialized?');
        console.log("User wants to pair, and we still have no cert. Problem = very yes.");
        onFailure();
    }

    if(!api) {
        api = new NvHTTP(host, myUniqueid);
    }

    if(api.paired) {
        onSuccess();
    }

    var randomNumber = String("0000" + (Math.random()*10000|0)).slice(-4);
    var pairingDialog = document.querySelector('#pairingDialog');
    $('#pairingDialogText').html('Please enter the number ' + randomNumber + ' on the GFE dialog on the computer.  This dialog will be dismissed once complete');
    pairingDialog.showModal();
    console.log('sending pairing request to ' + host + ' with random number ' + randomNumber);

    api.pair(randomNumber).then(function (paired) {
        if (!paired) {
            if (api.currentGame != 0) {
                $('#pairingDialogText').html('Error: ' + host + ' is in app.  Cannot pair until the app is stopped.');
            } else {
                $('#pairingDialogText').html('Error: failed to pair with ' + host + '.  failure reason unknown.');
            }
            onFailure();
        }
        
        snackbarLog('Pairing successful');
        pairingDialog.close();
        
        var hostSelect = $('#selectHost')[0];
        for(var i = 0; i < hostSelect.length; i++) { // check if we already have the host.
            if (hostSelect.options[i].value == host) onSuccess();
        }

        // old code for the drop down menu
        var opt = document.createElement('option');
        opt.appendChild(document.createTextNode(host));
        opt.value = host;
        $('#selectHost').append(opt);
        hosts.push(host);

        // new code for grid layout
        var cell = document.createElement('div');
        cell.className += 'mdl-cell mdl-cell--3-col';
        cell.id = 'hostgrid-' + hosts[i];
        cell.innerHTML = hosts[i];
        $('#host-grid').append(cell);
        cell.onclick = hostChosen;

        saveHosts();
        onSuccess();

    }, function (failedPairing) {
        snackbarLog('Failed pairing to: ' + host);
        console.log('pairing failed, and returned ' + failedPairing);
        onFailure();
    });
}

function hostChosen(sourceEvent) {

    if(sourceEvent && sourceEvent.srcElement) {
        console.log('parsing host from grid element.');
        host = sourceEvent.srcElement.innerText;
    } else {
        console.log('falling back to old host selection');
        updateHost();
    }


    if(!api || api.address != host) {
        api = new NvHTTP(host, myUniqueid);
    }

    api.refreshServerInfo().then(function (ret) {
        if(!api.paired) {
            pairTo(host);
        }
        if(hosts.indexOf(host) < 0) { // we don't have this host in our list. add it, and save it.
            var opt = document.createElement('option');
            opt.appendChild(document.createTextNode(host));
            opt.value = host;
            $('#selectHost').append(opt);
            hosts.push(host);
            saveHosts();
            $('#GFEHostIPField').val(''); // eat the contents of the textbox
            $('#GFEHostIPField').parent().removeClass('is-dirty');
        }
        showApps();
    }, function (failedRefreshInfo) {
        snackbarLog('Failed to connect to ' + host + '! Are you sure the host is on?');
        console.log('Returned error was: ' + failedRefreshInfo);
    });
}

// the `+` was selected on the host grid.
// give the user a dialog to input connection details for the PC
function addHost() {
    document.querySelector('#addHostDialog').showModal();
}

// user canceled the dialog for adding a new PC
function cancelAddHost() {
    document.querySelector('#addHostDialog').close();
}

function continueAddHost() {
    var inputHost = $('#dialogInputHost').val();

    pairTo(inputHost, 
        function() { document.querySelector('#addHostDialog').close() }, 
        function() {snackbarLog('pairing to ' + inputHost + ' failed!');} 
        );

}

// locally remove the hostname/ip from the saved `hosts` array.
// note: this does not make the host forget the pairing to us.
// this means we can re-add the host, and will still be paired.
function forgetHost() {
    updateHost();
    $("#selectHost option:selected").remove();
    hosts.splice(hosts.indexOf(host), 1); // remove the host from the array;
    saveHosts();
}

function pairingPopupCanceled() {
    document.querySelector('#pairingDialog').close();
}

// show the app list
function showApps() {
    if(!api || !api.paired) {  // safety checking. shouldn't happen.
        console.log('Moved into showApps, but `api` did not initialize properly! Failing.');
        return;
    }

    api.getAppList().then(function (appList) {
        if ($('#selectGame').has('option').length > 0 ) { 
            // there was already things in the dropdown. Clear it, then add the new ones.
            // Most likely, the user just hit the 'retrieve app list' button again
            $('#selectGame').empty();
        }

        appList.forEach(function (app) {
            $('#selectGame').append($('<option>', {value: app.id, text: app.title}));
        });

        $("#selectGame").html($("#selectGame option").sort(function (a, b) {  // thanks, http://stackoverflow.com/a/7466196/3006365
            return a.text.toUpperCase() == b.text.toUpperCase() ? 0 : a.text.toUpperCase() < b.text.toUpperCase() ? -1 : 1
        }));

        if (api.currentGame != 0)
            $('#selectGame').val(api.currentGame);

        gameSelectUpdated();  // default the button to 'Resume Game' if one is running.
    }, function (failedAppList) {
        console.log('Failed to get applist from host: ' + api.address);
    });

    showAppsMode();
}

function showAppsMode() {
    console.log("entering show apps mode.");
    $(".mdl-layout__header").show();
    $("#main-content").children().not("#listener, #loadingSpinner, #naclSpinner").show();
    $("#main-content").removeClass("fullscreen");
    $("#listener").removeClass("fullscreen");
    $("body").css('backgroundColor', 'white');
    gameSelectUpdated();  // since we just played the game, we need to show it as running once we quit.
}

// every time the user selects an app from the select menu,
// we want to check if that's the currently running app
// and if it is, we want the "run" button to change to "resume"
// in theory we should be able to cache the api.currentGame to prevent another call.
function gameSelectUpdated() {
    var currentApp = $("#selectGame").val();
    if(api.currentGame == parseInt(currentApp)) {
        $("#startGameButton").html('Resume Game');
    } else {
        $("#startGameButton").html('Run Game');
    }
}

function startSelectedGame() {
    // do NOT update the host.
    // we're just grabbing the currently selected option from #selectGame, and feeding it into NvHTTP
    // if we need to reconnect to the host, and `host` has been updated, we can pass the appID we listed from the previous host
    // then everyone's sad. So we won't do that.  Because the only way to see the startGame button is to list the apps for the host anyways.
    if(!api || !api.paired) {
        console.log('attempted to start a game, but `api` did not initialize properly. Failing!');
        return;
    }

    var appID = $("#selectGame").val();  // app that the user wants to play

    // refresh the server info, because the user might have quit the game.
    api.refreshServerInfo().then(function (ret) {
        if(api.currentGame != 0 && api.currentGame != appID) {
            api.getAppById(api.currentGame).then(function (currentApp) {
                var replaceAppDialog = document.querySelector('#replaceAppDialog');
                document.getElementById('replaceAppDialogText').innerHTML = 
                    currentApp.title + ' is already running. Would you like to quit ' +
                    currentApp.title + ' to start ' + $("#selectGame option:selected").text() + '?';
                replaceAppDialog.showModal();
                return;
            }, function (failedCurrentApp) {
                console.log('ERROR: failed to get the current running app from host!');
                console.log('Returned error was: ' + failedCurrentApp);
                return;
            });
            return;
        }

        var frameRate = $("#selectFramerate").val();
        var streamWidth = $('#selectResolution option:selected').val().split(':')[0];
        var streamHeight = $('#selectResolution option:selected').val().split(':')[1];
        // we told the user it was in Mbps. We're dirty liars and use Kbps behind their back.
        var bitrate = parseInt($("#bitrateSlider").val()) * 1000;
        console.log('startRequest:' + host + ":" + streamWidth + ":" + streamHeight + ":" + frameRate + ":" + bitrate);

        var rikey = generateRemoteInputKey();
        var rikeyid = generateRemoteInputKeyId();

        $('#loadingMessage').text('Starting ' + $("#selectGame option:selected").text() + '...');
        playGameMode();

        if(api.currentGame == appID) // if user wants to launch the already-running app, then we resume it.
            return api.resumeApp(rikey, rikeyid).then(function (ret) {
                sendMessage('startRequest', [host, streamWidth, streamHeight, frameRate,
                    bitrate.toString(), api.serverMajorVersion.toString(), rikey, rikeyid.toString()]);
            }, function (failedResumeApp) {
                console.log('ERROR: failed to resume the app!');
                console.log('Returned error was: ' + failedResumeApp);
                return;
            });

        api.launchApp(appID,
            streamWidth + "x" + streamHeight + "x" + frameRate,
            1, // Allow GFE to optimize game settings
            rikey, rikeyid,
            0, // Play audio locally too
            0x030002 // Surround channel mask << 16 | Surround channel count
            ).then(function (ret) {
                sendMessage('startRequest', [host, streamWidth, streamHeight, frameRate,
                    bitrate.toString(), api.serverMajorVersion.toString(), rikey, rikeyid.toString()]);
            }, function (failedLaunchApp) {
                console.log('ERROR: failed to launch app with appID: ' + appID);
                console.log('Returned error was: ' + failedLaunchApp);
                return;
            });
    });
}

function cancelReplaceApp() {
    showAppsMode();
    document.querySelector('#replaceAppDialog').close();
    console.log('closing app dialog, and returning');
}

function continueReplaceApp() {
    console.log('stopping game, and closing app dialog, and returning');
    stopGame(startSelectedGame);  // stop the game, then start the selected game once it's done.
    document.querySelector('#replaceAppDialog').close();
}

function playGameMode() {
    console.log("entering play game mode");
    $(".mdl-layout__header").hide();
    $("#main-content").children().not("#listener, #loadingSpinner").hide();
    $("#main-content").addClass("fullscreen");
    fullscreenNaclModule();
    $("body").css('backgroundColor', 'black');

    chrome.app.window.current().fullscreen();
    $('#loadingSpinner').css('display', 'inline-block');

}

// Maximize the size of the nacl module by scaling and resizing appropriately
function fullscreenNaclModule() {
    var streamWidth = $('#selectResolution option:selected').val().split(':')[0];
    var streamHeight = $('#selectResolution option:selected').val().split(':')[1];
    var screenWidth = window.innerWidth;
    var screenHeight = window.innerHeight;

    var xRatio = screenWidth / streamWidth;
    var yRatio = screenHeight / streamHeight;

    var zoom = Math.min(xRatio, yRatio);

    var module = $("#nacl_module")[0];
    module.width = zoom * streamWidth;
    module.height = zoom * streamHeight;
    module.style.paddingTop = ((screenHeight - module.height) / 2) + "px";
}

function stopGame(callbackFunction) {

    api.refreshServerInfo().then(function (ret) {
        api.getAppById(api.currentGame).then(function (runningApp) {
            if (!runningApp) {
                snackbarLog('Nothing was running');
                return;
            }
            var appName = runningApp.title;
            snackbarLog('Stopping ' + appName);
            api.quitApp().then(function (ret2) { 
                api.refreshServerInfo().then(function (ret3) { // refresh to show no app is currently running.
                    showAppsMode();
                    if (typeof(callbackFunction) === "function") callbackFunction();
                }, function (failedRefreshInfo2) {
                    console.log('ERROR: failed to refresh server info!');
                    console.log('Returned error was: ' + failedRefreshInfo2);
                });
            }, function (failedQuitApp) {
                console.log('ERROR: failed to quit app!');
                console.log('Returned error was: ' + failedQuitApp);
            });
        }, function (failedGetApp) {
            console.log('ERROR: failed to get app ID!');
            console.log('Returned error was: ' + failedRefreshInfo);
        });
    }, function (failedRefreshInfo) {
        console.log('ERROR: failed to refresh server info!');
        console.log('Returned error was: ' + failedRefreshInfo);
    });
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
    } else if (res.lastIndexOf("3840:2160", 0) === 0) {
        if (frameRate.lastIndexOf("30", 0) === 0) { // 2160p, 30fps
            $('#bitrateSlider')[0].MaterialSlider.change('40');
        } else { // 2160p, 60fps
            $('#bitrateSlider')[0].MaterialSlider.change('80');
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
            $('#selectResolution').val(previousValue.resolution != null ? previousValue.resolution : '1280:720');
        });
        // load stored framerate prefs
        chrome.storage.sync.get('frameRate', function(previousValue) {
            $('#selectFramerate').val(previousValue.frameRate != null ? previousValue.frameRate : '60');
        });
        // load previously connected hosts
        chrome.storage.sync.get('hosts', function(previousValue) {
            hosts = previousValue.hosts != null ? previousValue.hosts : [];
            for(var i = 0; i < hosts.length; i++) { // programmatically add each new host.
                var opt = document.createElement('option');
                opt.appendChild(document.createTextNode(hosts[i]));
                opt.value = hosts[i];
                $('#selectHost').append(opt);

                var cell = document.createElement('div');
                cell.className += 'mdl-cell mdl-cell--3-col';
                cell.id = 'hostgrid-' + hosts[i];
                cell.innerHTML = hosts[i];
                $('#host-grid').append(cell);
                cell.onclick = hostChosen;

            }

        });
        // load stored bitrate prefs
        chrome.storage.sync.get('bitrate', function(previousValue) {
            $('#bitrateSlider')[0].MaterialSlider.change(previousValue.bitrate != null ? previousValue.bitrate : '10');
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
        });
    }

    findNvService(function (finder, opt_error) {
        if (finder.byService_['_nvstream._tcp']) {
            var ips = Object.keys(finder.byService_['_nvstream._tcp']);
            for (var ip in ips) {
                if (finder.byService_['_nvstream._tcp'][ip]) {
                    var cell = document.createElement('div');
                    cell.className += 'mdl-cell mdl-cell--3-col';
                    cell.id = 'hostgrid-' + ip;
                    cell.innerHTML = ip;
                    $('#host-grid').append(cell);
                    cell.onclick = hostChosen;
                }
            }
        }
    });
}


window.onload = onWindowLoad;
