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
    $('#cancelQuitApp').on('click', cancelQuitApp);
    $('#backIcon').on('click', showHostsAndSettingsMode);
    $('#continueQuitApp').on('click', continueQuitApp);
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
    showHostsAndSettingsMode();
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
    }


    if(!api || api.address != host) {
        api = new NvHTTP(host, myUniqueid);
    }

    api.refreshServerInfo().then(function (ret) {
        if(!api.paired) {
            pairTo(host);
        }
        if(hosts.indexOf(host) < 0) { // we don't have this host in our list. add it, and save it.
            var cell = document.createElement('div');
            cell.className += 'mdl-cell mdl-cell--3-col';
            cell.id = 'hostgrid-' + hosts[i];
            cell.innerHTML = hosts[i];
            $('#host-grid').append(cell);
            cell.onclick = hostChosen;
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
// TODO: use the chrome context menu to add right-click support to remove the host in grid-ui
// https://github.com/GoogleChrome/chrome-app-samples/blob/master/samples/context-menu/main.js
function forgetHost() {
    snackbarLog('Feature not yet ported to grid-ui');
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

        // if game grid is populated, empty it
        if($("#game-grid").children().length > 0) {
            $("#game-grid").empty();
        }
        

        appList.forEach(function (app) {
            api.getBoxArt(app.id).then(function (resolvedPromise) {
                var imageBlob =  new Blob([resolvedPromise], {type: "image/png"});
                $("#game-grid").append($("<div>", {html:$("<img \>", {src: URL.createObjectURL(imageBlob), id: 'game-'+app.id, name: app.title }), class: 'box-art mdl-cell mdl-cell--3-col'}).append($("<span>", {html: app.title, class:"game-title"})));
                $('#game-'+app.id).on('click', startGame);

                if (api.currentGame === app.id){ // stylize the currently running game
                    // destylize it, if it has the not-current-game style
                    if ($('#game-'+ app.id).hasClass("not-current-game")) $('#game-'+ app.id).removeClass("not-current-game");
                    // add the current-game style
                    $('#game-'+ app.id).addClass("current-game");
                } else {
                    // destylize it, if it has the current-game style
                    if ($('#game-'+ app.id).hasClass("current-game")) $('#game-'+ app.id).removeClass("current-game");
                    // add the not-current-game style
                    $('#game-'+ app.id).addClass('not-current-game');
                }

            }, function (failedPromise) {
                console.log('Error! Failed to retrieve box art for app ID: ' + app.id + '. Returned value was: ' + failedPromise)
            });
            
        });

    }, function (failedAppList) {
        console.log('Failed to get applist from host: ' + api.address);
    });

    showAppsMode();
}

// set the layout to the initial mode you see when you open moonlight
function showHostsAndSettingsMode() {
    console.log('entering show hosts and settings mode.');
    $('#backIcon').hide();
    $(".mdl-layout__header").show();
    $("#main-content").children().not("#listener, #loadingSpinner, #naclSpinner").show();
    $("#game-grid").hide();
    $("#main-content").removeClass("fullscreen");
    $("#listener").removeClass("fullscreen");
    $("body").css('backgroundColor', 'white');
}

function showAppsMode() {
    console.log("entering show apps mode.");
    $('#backIcon').show();
    $(".mdl-layout__header").show();
    $("#main-content").children().not("#listener, #loadingSpinner, #naclSpinner").show();
    $("#streamSettings").hide();
    $("#hostSettings").hide();
    $("#main-content").removeClass("fullscreen");
    $("#listener").removeClass("fullscreen");
    $("body").css('backgroundColor', 'white');

}


// start the given appID.  if another app is running, offer to quit it.
// if the given app is already running, just resume it.
function startGame(sourceEvent) {
    if(!api || !api.paired) {
        console.log('attempted to start a game, but `api` did not initialize properly. Failing!');
        return;
    }

    if(sourceEvent && sourceEvent.target) {
        appID = parseInt(sourceEvent.target.id.substring('game-'.length));  // parse the AppID from the ID of the grid icon.
        appName = sourceEvent.target.name;
    } else {
        console.log('Error! failed to parse appID from grid icon! Failing...');
        snackbarLog('An error occurred while parsing the appID from the grid icon.')
        return;
    }

    // refresh the server info, because the user might have quit the game.
    api.refreshServerInfo().then(function (ret) {
        if(api.currentGame != 0 && api.currentGame != appID) {
            api.getAppById(api.currentGame).then(function (currentApp) {
                var quitAppDialog = document.querySelector('#quitAppDialog');
                document.getElementById('quitAppDialogText').innerHTML = 
                    currentApp.title + ' is already running. Would you like to quit ' +
                    currentApp.title + '?';
                quitAppDialog.showModal();
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

        $('#loadingMessage').text('Starting ' + appName + '...');
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

function cancelQuitApp() {
    document.querySelector('#quitAppDialog').close();
    console.log('closing app dialog, and returning');
}

function continueQuitApp(sourceEvent) {
    // I want the sourceEvent's sourceEvent
    console.log('stopping game, and closing app dialog, and returning');
    stopGame();
    document.querySelector('#quitAppDialog').close();
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
                var cell = document.createElement('div');
                cell.className += 'mdl-cell mdl-cell--3-col host-cell';
                cell.id = 'hostgrid-' + hosts[i];
                cell.innerHTML = hosts[i];
                $(cell).prepend($("<img>", {src: "static/res/ic_desktop_windows_white_24px.svg"}));
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
