var hosts = {};  // hosts is an associative array of NvHTTP objects, keyed by server UID
var activePolls = {};  // hosts currently being polled.  An associated array of polling IDs, keyed by server UID
var pairingCert;
var myUniqueid;
var api;
var relaunchSourceEvent;
var unpairHostSourceEvent;

// Called by the common.js module.
function attachListeners() {
    changeUiModeForNaClLoad();

    $('#selectResolution').on('change', saveResolution);
    $('#selectFramerate').on('change', saveFramerate);
    $('#bitrateSlider').on('input', updateBitrateField); // input occurs every notch you slide
    $('#bitrateSlider').on('change', saveBitrate); // change occurs once the mouse lets go.
    $("#remoteAudioEnabledSwitch").on('click', saveRemoteAudio);
    $('#hostChosen').on('click', hostChosen);
    $('#addHostCell').on('click', addHost);
    $('#cancelAddHost').on('click', cancelAddHost);
    $('#continueAddHost').on('click', continueAddHost);
    $('#continueUnpairHost').on('click', unpairHost);
    $('#cancelUnpairHost').on('click', cancelUnpairHost);
    $('#cancelPairingDialog').on('click', pairingPopupCanceled);
    $('#cancelQuitApp').on('click', cancelQuitApp);
    $('#backIcon').on('click', showHostsAndSettingsMode);
    $('#continueQuitApp').on('click', continueQuitApp);
    $('#quitCurrentApp').on('click', stopGameWithConfirmation);
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
    for(hostUID in hosts) {
        beginBackgroundPollingOfHost(hosts[hostUID]);
    }
}

function beginBackgroundPollingOfHost(host) {
    if (host.online) {
        $("#hostgrid-" + host.serverUid).removeClass('host-cell-inactive');

        // The host was already online. Just start polling in the background now.
        activePolls[host.serverUid] = window.setInterval(function() {
            if (api && activePolls[api.serverUid] != null) {
                stopBackgroundPollingOfHost(api);
                return;
            }
            // every 5 seconds, poll at the address we know it was live at
            host.pollServer(function () {
                if (host.online) {
                    $("#hostgrid-" + host.serverUid).removeClass('host-cell-inactive');
                } else {
                    $("#hostgrid-" + host.serverUid).addClass('host-cell-inactive');
                }
            });
        }, 5000);
    } else {
        $("#hostgrid-" + host.serverUid).addClass('host-cell-inactive');

        // The host was offline, so poll immediately.
        host.pollServer(function () {
            if (host.online) {
                $("#hostgrid-" + host.serverUid).removeClass('host-cell-inactive');
            } else {
                $("#hostgrid-" + host.serverUid).addClass('host-cell-inactive');
            }

            // Now start background polling
            activePolls[host.serverUid] = window.setInterval(function() {
                if (api && activePolls[api.serverUid] != null) {
                    stopBackgroundPollingOfHost(api);
                    return;
                }
                // every 5 seconds, poll at the address we know it was live at
                host.pollServer(function () {
                    if (host.online) {
                        $("#hostgrid-" + host.serverUid).removeClass('host-cell-inactive');
                    } else {
                        $("#hostgrid-" + host.serverUid).addClass('host-cell-inactive');
                    }
                });
            }, 5000);
        });
    }
}

function stopBackgroundPollingOfHost(host) {
    console.log('stopping background polling of server: ' + host.toString());
    window.clearInterval(activePolls[host.serverUid]);
    delete activePolls[host.serverUid];
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
        console.log("Failed to get uniqueId.  We should have already generated one.  Regenerating...");
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

// pair to the given NvHTTP host object.  Returns whether pairing was successful.
function pairTo(nvhttpHost, onSuccess, onFailure) {
    if(!pairingCert) {
        snackbarLog('ERROR: cert has not been generated yet. Is NaCl initialized?');
        console.log("User wants to pair, and we still have no cert. Problem = very yes.");
        onFailure();
        return;
    }

    var _api = nvhttpHost;
    _api.refreshServerInfo().then(function (ret) {
        if (_api.paired) {
            onSuccess();
            return;
        }

        var randomNumber = String("0000" + (Math.random()*10000|0)).slice(-4);
        var pairingDialog = document.querySelector('#pairingDialog');
        $('#pairingDialogText').html('Please enter the number ' + randomNumber + ' on the GFE dialog on the computer.  This dialog will be dismissed once complete');
        pairingDialog.showModal();
        console.log('sending pairing request to ' + _api.address + ' with random number ' + randomNumber);

        _api.pair(randomNumber).then(function (paired) {
            if (!paired) {
                if (_api.currentGame != 0) {
                    $('#pairingDialogText').html('Error: ' + _api.address + ' is in app.  Cannot pair until the app is stopped.');
                } else {
                    $('#pairingDialogText').html('Error: failed to pair with ' + _api.address + '.  failure reason unknown.');
                }
                console.log('failed API object: ');
                console.log(_api.toString());
                onFailure();
                return;
            }

            snackbarLog('Pairing successful');
            pairingDialog.close();
            onSuccess();
        }, function (failedPairing) {
            snackbarLog('Failed pairing to: ' + _api.address);
            console.log('pairing failed, and returned ' + failedPairing);
            console.log('failed API object: ');
            console.log(_api.toString());
            onFailure();
        });
    }, function (failedRefreshInfo) {
        snackbarLog('Failed to connect to ' + _api.address + '! Are you sure the host is on?');
        console.log('Returned error was: ' + failedRefreshInfo);
        console.log('failed API object: ');
        console.log(_api.toString());
        onFailure();
    });
}

function hostChosen(sourceEvent) {

    // if(sourceEvent && sourceEvent.srcElement) {
    //     if (sourceEvent.srcElement.innerText == "") {
    //         console.log('user clicked image. we gotta hack to parse out the host.');
    //         var serverUid = sourceEvent.currentTarget.id.substring("hostgrid-".length);
    //     } else {
    //         console.log('parsing host from grid element.');
    //         var serverUid = sourceEvent.srcElement.id.substring("hostgrid-".length);
    //     }
    // } else
    if (sourceEvent && sourceEvent.target && sourceEvent.target.id ) {
        console.log('hacking out the host');
        var serverUid = sourceEvent.target.id.substring("hostgrid-".length);
    } else if (sourceEvent.target.parentElement && sourceEvent.target.parentElement.id) {
        var serverUid = sourceEvent.target.parentElement.id.substring("hostgrid-".length);
    } else {
        console.log('Failed to find host! This should never happen!');
        console.log(sourceEvent);
    }

    api = hosts[serverUid];
    if (!api.online) {
        return;
    }

    stopBackgroundPollingOfHost(api);

    if (!api.paired) {
        // Still not paired; go to the pairing flow
        pairTo(api, function(){ showApps(api); saveHosts();}, function(){});
    } else {
        // When we queried again, it was paired, so show apps.
        showApps(api);
    }
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

// host is an NvHTTP object
function addHostToGrid(host) {
    var outerDiv = $("<div>", {class: 'host-container mdl-cell--3-col', id: 'host-container-' + host.serverUid });
    var cell = $("<div>", {class: 'mdl-cell mdl-cell--3-col host-cell mdl-button mdl-js-button mdl-js-ripple-effect', id: 'hostgrid-' + host.serverUid, html:host.hostname });
    $(cell).prepend($("<img>", {src: "static/res/ic_desktop_windows_white_24px.svg"}));
    var removalButton = $("<div>", {class: "remove-host", id: "removeHostButton-" + host.serverUid});
    removalButton.click(confirmUnpairHost);
    cell.click(hostChosen);
    $(outerDiv).append(cell);
    $(outerDiv).append(removalButton);
    $('#host-grid').append(outerDiv);
    hosts[host.serverUid] = host;
}

function continueAddHost() {
    var inputHost = $('#dialogInputHost').val();
    var _nvhttpHost = new NvHTTP(inputHost, myUniqueid, inputHost);
    pairTo(_nvhttpHost,
        function() {
            _nvhttpHost.refreshServerInfo().then(function (onSuccess) {
                addHostToGrid(_nvhttpHost);
                saveHosts();
                document.querySelector('#addHostDialog').close();
            }, function (onFailure) {
                console.log('FAILURE!');
            });
        },
        function() {
            snackbarLog('pairing to ' + inputHost + ' failed!');
        });
}

function confirmUnpairHost(sourceEvent) {
    snackbarLog('Need to parse host from event: ' + sourceEvent);
    var unpairHostDialog = document.querySelector('#unpairHostDialog');
    document.getElementById('unpairHostDialogText').innerHTML =
    ' Are you sure you want like to unpair from ' + hosts[sourceEvent.target.id.substring("removeHostButton-".length)].hostname + '?';
    unpairHostDialog.showModal();
    unpairHostSourceEvent = sourceEvent;
}

function cancelUnpairHost() {
    var unpairHostDialog = document.querySelector('#unpairHostDialog');
    unpairHostDialog.close();
}

// locally remove the hostname/ip from the saved `hosts` array.
// note: this does not make the host forget the pairing to us.
// this means we can re-add the host, and will still be paired.
function unpairHost() {
    var sourceEvent = unpairHostSourceEvent;
    unpairHostSourceEvent = null;
    host = hosts[sourceEvent.target.id.substring("removeHostButton-".length)];
    host.unpair().then(function (onSuccess) {
        var unpairHostDialog = document.querySelector('#unpairHostDialog');
        unpairHostDialog.close();
        $('#host-container-' + host.serverUid).remove();
        snackbarLog('Successfully unpaired from host');
        delete hosts[host.serverUid]; // remove the host from the array;
        saveHosts();
    }, function (onFailure) {
        snackbarLog('Failed to unpair from host!');
    });
}

function pairingPopupCanceled() {
    document.querySelector('#pairingDialog').close();
}

// puts the CSS style for current app on the app that's currently running
// and puts the CSS style for non-current app apps that aren't running
// this requires a hot-off-the-host `api`, and the appId we're going to stylize
// the function was made like this so that we can remove duplicated code, but
// not do N*N stylizations of the box art, or make the code not flow very well 
function stylizeBoxArt(freshApi, appIdToStylize) {
    if (freshApi.currentGame === appIdToStylize){ // stylize the currently running game
        // destylize it, if it has the not-current-game style
        if ($('#game-'+ appIdToStylize).hasClass("not-current-game")) $('#game-'+ appIdToStylize).removeClass("not-current-game");
        // add the current-game style
        $('#game-'+ appIdToStylize).addClass("current-game");
    } else {
        // destylize it, if it has the current-game style
        if ($('#game-'+ appIdToStylize).hasClass("current-game")) $('#game-'+ appIdToStylize).removeClass("current-game");
        // add the not-current-game style
        $('#game-'+ appIdToStylize).addClass('not-current-game');
    }
}

// show the app list
function showApps() {
    if(!api || !api.paired) {  // safety checking. shouldn't happen.
        console.log('Moved into showApps, but `api` did not initialize properly! Failing.');
        return;
    }
    $('#quitCurrentApp').show();
    $("#game-grid").empty();

    // Show a spinner while the applist loads
    $('#naclSpinnerMessage').text('Loading apps...');
    $('#naclSpinner').css('display', 'inline-block');

    api.getAppList().then(function (appList) {
        $('#naclSpinner').hide();

        // if game grid is populated, empty it
        appList.forEach(function (app) {
            api.getBoxArt(app.id).then(function (resolvedPromise) {
                // put the box art into the image holder
                if ($('#game-' + app.id).length === 0) {
                    // double clicking the button will cause multiple box arts to appear.
                    // to mitigate this we ensure we don't add a duplicate.
                    // This isn't perfect: there's lots of RTTs before the logic prevents anything
                    var imageBlob =  new Blob([resolvedPromise], {type: "image/png"});
                    $("#game-grid").append($("<div>", {html:$("<img \>", {src: URL.createObjectURL(imageBlob), id: 'game-'+app.id, name: app.title }), class: 'box-art mdl-cell mdl-cell--3-col'}).append($("<span>", {html: app.title, class:"game-title"})));
                    $('#game-'+app.id).on('click', startGame);

                    // apply CSS stylization to indicate whether the app is active
                    stylizeBoxArt(api, app.id);
                }

            }, function (failedPromise) {
                console.log('Error! Failed to retrieve box art for app ID: ' + app.id + '. Returned value was: ' + failedPromise)
                console.log('failed API object: ');
                console.log(api.toString());
            });
        });
    }, function (failedAppList) {
        $('#naclSpinner').hide();

        console.log('Failed to get applist from host: ' + api.address);
        console.log('failed API object: ');
        console.log(api.toString());
    });

    showAppsMode();
}

// set the layout to the initial mode you see when you open moonlight
function showHostsAndSettingsMode() {
    console.log('entering show hosts and settings mode.');
    $('#backIcon').hide();
    $('#quitCurrentApp').hide();
    $(".mdl-layout__header").show();
    $("#main-content").children().not("#listener, #loadingSpinner, #naclSpinner").show();
    $("#game-grid").hide();
    $("#main-content").removeClass("fullscreen");
    $("#listener").removeClass("fullscreen");
    $("body").css('backgroundColor', 'white');
    if(api && !activePolls[api.serverUid]) {
        beginBackgroundPollingOfHost(api);
        api = null;
    }
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

    var host = api.address;

    // refresh the server info, because the user might have quit the game.
    api.refreshServerInfo().then(function (ret) {
        if(api.currentGame != 0 && api.currentGame != appID) {
            api.getAppById(api.currentGame).then(function (currentApp) {
                // This event gets saved and passed back to this callback
                // after the game is quit
                relaunchSourceEvent = sourceEvent;

                var quitAppDialog = document.querySelector('#quitAppDialog');
                document.getElementById('quitAppDialogText').innerHTML = 
                    currentApp.title + ' is already running. Would you like to quit ' +
                    currentApp.title + '?';
                quitAppDialog.showModal();
                return;
            }, function (failedCurrentApp) {
                console.log('ERROR: failed to get the current running app from host!');
                console.log('Returned error was: ' + failedCurrentApp);
                console.log('failed API object: ');
                console.log(api.toString());
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

        if(api.currentGame == appID) { // if user wants to launch the already-running app, then we resume it.
            return api.resumeApp(rikey, rikeyid).then(function (ret) {
                sendMessage('startRequest', [host, streamWidth, streamHeight, frameRate,
                        bitrate.toString(), api.serverMajorVersion.toString(), rikey, rikeyid.toString()]);
            }, function (failedResumeApp) {
                console.log('ERROR: failed to resume the app!');
                console.log('Returned error was: ' + failedResumeApp);
                return;
            });
        }

        remote_audio_enabled = $("#remoteAudioEnabledSwitch").parent().hasClass('is-checked') ? 1 : 0;

        api.launchApp(appID,
                streamWidth + "x" + streamHeight + "x" + frameRate,
                1, // Allow GFE to optimize game settings
                rikey, rikeyid,
                remote_audio_enabled, // Play audio locally too?
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
    relaunchSourceEvent = null;
    document.querySelector('#quitAppDialog').close();
    console.log('closing app dialog, and returning');
}

function continueQuitApp(sourceEvent) {
    console.log('stopping game, and closing app dialog, and returning');
    stopGame(
        function() {
            if (relaunchSourceEvent != null) {
                // Save and null relaunchSourceEvent just in case startGame()
                // wants to set it again.
                var event = relaunchSourceEvent;
                relaunchSourceEvent = null;
                startGame(event);
            }
        }
    );
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

function stopGameWithConfirmation() {
    if (api.currentGame === 0) {
        snackbarLog('Nothing was running');
    } else {
        api.getAppById(api.currentGame).then(function (currentGame) {
            var quitAppDialog = document.querySelector('#quitAppDialog');
            document.getElementById('quitAppDialogText').innerHTML =
            ' Are you sure you would like to quit ' +
            currentGame.title + '?  Unsaved progress will be lost.';
            quitAppDialog.showModal();
        });
    }
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
                    stylizeBoxArt(api, runningApp.id);
                    if (typeof(callbackFunction) === "function") callbackFunction();
                }, function (failedRefreshInfo2) {
                    console.log('ERROR: failed to refresh server info!');
                    console.log('Returned error was: ' + failedRefreshInfo2);
                    console.log('failed server was: ' + api.toString());
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

// storing data in chrome.storage takes the data as an object, and shoves it into JSON to store
// unfortunately, objects with function instances (classes) are stripped of their function instances when converted to a raw object
// so we cannot forget to revive the object after we load it.
function saveHosts() {
    for(hostUID in hosts) {
        // slim the object down to only store the necessary bytes, because we have limited storage
        hosts[hostUID]._prepareForStorage();
    }
    storeData('hosts', hosts, null);
}

function saveBitrate() {
    storeData('bitrate', $('#bitrateSlider').val(), null);
}

function saveRemoteAudio() {
    console.log('saving remote audio state');
    // problem: when off, and the app is just starting, a tick to the switch doesn't always toggle it
    // second problem: this callback is called immediately after clicking, so the HTML class `is-checked` isn't toggled yet
    // to solve the second problem, we invert the boolean.  This has worked in all cases I've tried, except for the first case
    storeData('remoteAudio', !$("#remoteAudioEnabledSwitch").parent().hasClass('is-checked'), null);
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
    } else {  // unrecognized option. In case someone screws with the JS to add custom resolutions
        $('#bitrateSlider')[0].MaterialSlider.change('10');
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
        chrome.storage.sync.get('remoteAudio', function(previousValue) {
            if(previousValue.remoteAudio == null) {
                document.querySelector('#remoteAudioEnabledSwitchContainer').MaterialSwitch.off();
                return;
            } else if(previousValue.remoteAudio == false) {
                document.querySelector('#remoteAudioEnabledSwitchContainer').MaterialSwitch.off();
            }  else {
                document.querySelector('#remoteAudioEnabledSwitchContainer').MaterialSwitch.on();
            }
        });
        // load stored framerate prefs
        chrome.storage.sync.get('frameRate', function(previousValue) {
            $('#selectFramerate').val(previousValue.frameRate != null ? previousValue.frameRate : '60');
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
            } else {
                myUniqueid = uniqueid();
                storeData('uniqueid', myUniqueid, null);
            }
        });
        // load previously connected hosts, which have been killed into an object, and revive them back into a class
        chrome.storage.sync.get('hosts', function(previousValue) {
            hosts = previousValue.hosts != null ? previousValue.hosts : {};
            for(hostUID in hosts) { // programmatically add each new host.
                var revivedHost = new NvHTTP(hosts[hostUID].address, myUniqueid, hosts[hostUID].userEnteredAddress);
                revivedHost.serverUid = hosts[hostUID].serverUid;
                revivedHost.externalIP = hosts[hostUID].externalIP;
                revivedHost.hostname = hosts[hostUID].hostname;
                addHostToGrid(revivedHost);
            }
        });
    }

    findNvService(function (finder, opt_error) {
        if (finder.byService_['_nvstream._tcp']) {
            var ips = Object.keys(finder.byService_['_nvstream._tcp']);
            for (var ip in ips) {
                if (finder.byService_['_nvstream._tcp'][ip]) {
                    var mDnsDiscoveredHost = new NvHTTP(ip, myUniqueid);
                    if(hosts[mDnsDiscoveredHost.serverUid] != null) {
                        // if we're seeing a host we've already seen before, update it for the current local IP.
                        hosts[mDnsDiscoveredHost.serverUid].address = mDnsDiscoveredHost.address;
                    } else {
                        addHostToGrid(mDnsDiscoveredHost);
                    }
                }
            }
        }
    });
}


window.onload = onWindowLoad;
