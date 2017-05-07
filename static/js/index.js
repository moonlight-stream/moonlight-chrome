var hosts = {};  // hosts is an associative array of NvHTTP objects, keyed by server UID
var activePolls = {};  // hosts currently being polled.  An associated array of polling IDs, keyed by server UID
var pairingCert;
var myUniqueid;
var api;  // `api` should only be set if we're in a host-specific screen. on the initial screen it should always be null.
var isInGame = false; // flag indicating whether the game stream started
var windowState = 'normal'; // chrome's windowState, possible values: 'normal' or 'fullscreen'


// Called by the common.js module.
function attachListeners() {
    changeUiModeForNaClLoad();

    $('.resolutionMenu li').on('click', saveResolution);
    $('.framerateMenu li').on('click', saveFramerate);
    $('#bitrateSlider').on('input', updateBitrateField); // input occurs every notch you slide
    $('#bitrateSlider').on('change', saveBitrate); // change occurs once the mouse lets go.
    $("#remoteAudioEnabledSwitch").on('click', saveRemoteAudio);
    $('#addHostCell').on('click', addHost);
    $('#backIcon').on('click', showHostsAndSettingsMode);
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

function loadWindowState() {
    if (!chrome.storage) { return; }

    chrome.storage.sync.get('windowState', function(item) {
        // load stored window state
        windowState = (item && item.windowState)
            ? item.windowState
            : windowState;

        // subscribe to chrome's windowState events
        chrome.app.window.current().onFullscreened.addListener(onFullscreened);
        chrome.app.window.current().onBoundsChanged.addListener(onBoundsChanged);
    });
}

function onFullscreened() {
    if (!isInGame && windowState == 'normal') {
        storeData('windowState', 'fullscreen', null);
        windowState = 'fullscreen';
    }
}

function onBoundsChanged() {
    if (!isInGame && windowState == 'fullscreen') {
        storeData('windowState', 'normal', null);
        windowState = 'normal';
    }
}

function changeUiModeForNaClLoad() {
    $('#main-navigation').children().hide();
    $("#main-content").children().not("#listener, #naclSpinner").hide();
    $('#naclSpinnerMessage').text('Loading Moonlight plugin...');
    $('#naclSpinner').css('display', 'inline-block');
}

function restoreUiAfterNaClLoad() {
    $('#main-navigation').children().not("#quitCurrentApp").show();
    $("#main-content").children().not("#listener, #naclSpinner, #game-grid").show();
    $('#naclSpinner').hide();
    $('#loadingSpinner').css('display', 'none');
    showHostsAndSettingsMode();
    for(var hostUID in hosts) {
        beginBackgroundPollingOfHost(hosts[hostUID]);
    }

    findNvService(function (finder, opt_error) {
        if (finder.byService_['_nvstream._tcp']) {
            var ips = Object.keys(finder.byService_['_nvstream._tcp']);
            for (var i in ips) {
                var ip = ips[i];
                if (finder.byService_['_nvstream._tcp'][ip]) {
                    var mDnsDiscoveredHost = new NvHTTP(ip, myUniqueid);
                    mDnsDiscoveredHost.pollServer(function(returneMdnsDiscoveredHost) {
                        // Just drop this if the host doesn't respond
                        if (!returneMdnsDiscoveredHost.online) {
                            return;
                        }

                        if (hosts[returneMdnsDiscoveredHost.serverUid] != null) {
                            // if we're seeing a host we've already seen before, update it for the current local IP.
                            hosts[returneMdnsDiscoveredHost.serverUid].address = returneMdnsDiscoveredHost.address;
                        } else {
                            beginBackgroundPollingOfHost(returneMdnsDiscoveredHost);
                            addHostToGrid(returneMdnsDiscoveredHost, true);
                        }
                    });
                }
            }
        }
    });
}

function beginBackgroundPollingOfHost(host) {
    host.warmBoxArtCache();
    if (host.online) {
        $("#hostgrid-" + host.serverUid).removeClass('host-cell-inactive');
        // The host was already online. Just start polling in the background now.
        activePolls[host.serverUid] = window.setInterval(function() {
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

function snackbarLogLong(givenMessage) {
    console.log(givenMessage);
    var data = {
        message: givenMessage,
        timeout: 5000
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

    nvhttpHost.pollServer(function (ret) {
        if (!nvhttpHost.online) {
            snackbarLog('Failed to connect to ' + nvhttpHost.hostname + '! Are you sure the host is on?');
            console.log(nvhttpHost.toString());
            onFailure();
            return;
        }

        if (nvhttpHost.paired) {
            onSuccess();
            return;
        }

        var randomNumber = String("0000" + (Math.random()*10000|0)).slice(-4);
        var pairingDialog = document.querySelector('#pairingDialog');
        $('#pairingDialogText').html('Please enter the number ' + randomNumber + ' on the GFE dialog on the computer.  This dialog will be dismissed once complete');
        pairingDialog.showModal();

        $('#cancelPairingDialog').off('click');
        $('#cancelPairingDialog').on('click', function () {
            pairingDialog.close();
        });

        console.log('sending pairing request to ' + nvhttpHost.hostname + ' with random number ' + randomNumber);
        nvhttpHost.pair(randomNumber).then(function (paired) {
            if (!paired) {
                if (nvhttpHost.currentGame != 0) {
                    $('#pairingDialogText').html('Error: ' + nvhttpHost.hostname + ' is busy.  Stop streaming to pair.');
                } else {
                    $('#pairingDialogText').html('Error: failed to pair with ' + nvhttpHost.hostname + '.');
                }
                console.log('failed API object: ');
                console.log(nvhttpHost.toString());
                onFailure();
                return;
            }

            snackbarLog('Pairing successful');
            pairingDialog.close();
            onSuccess();
        }, function (failedPairing) {
            snackbarLog('Failed pairing to: ' + nvhttpHost.hostname);
            console.log('pairing failed, and returned ' + failedPairing);
            console.log('failed API object: ');
            console.log(nvhttpHost.toString());
            onFailure();
        });
    });
}

function hostChosen(host) {

    if (!host.online) {
        return;
    }

    stopBackgroundPollingOfHost(host);
    api = host;
    if (!host.paired) {
        // Still not paired; go to the pairing flow
        pairTo(host, function() { 
            showApps(host); 
            saveHosts();
        }, 
            function(){ 
        });
    } else {
        // When we queried again, it was paired, so show apps.
        showApps(host);
    }
}

// the `+` was selected on the host grid.
// give the user a dialog to input connection details for the PC
function addHost() {
    var modal = document.querySelector('#addHostDialog');
    modal.showModal();

    // drop the dialog if they cancel
    $('#cancelAddHost').off('click');
    $('#cancelAddHost').on('click', function() {
        modal.close();
    });

    // try to pair if they continue
    $('#continueAddHost').off('click');
    $('#continueAddHost').on('click', function () {
        var inputHost = $('#dialogInputHost').val();
        var _nvhttpHost = new NvHTTP(inputHost, myUniqueid, inputHost);

        pairTo(_nvhttpHost, function() {
                beginBackgroundPollingOfHost(_nvhttpHost);
                addHostToGrid(_nvhttpHost);
                saveHosts();
            }, function() {
                snackbarLog('pairing to ' + inputHost + ' failed!');
        });
        modal.close();
    });
}


// host is an NvHTTP object
function addHostToGrid(host, ismDNSDiscovered) {

    var outerDiv = $("<div>", {class: 'host-container mdl-card mdl-shadow--4dp', id: 'host-container-' + host.serverUid });
    var cell = $("<div>", {class: 'mdl-card__title mdl-card--expand', id: 'hostgrid-' + host.serverUid });
    $(cell).prepend($("<h2>", {class: "mdl-card__title-text", html: host.hostname}));
    var removalButton = $("<div>", {class: "remove-host", id: "removeHostButton-" + host.serverUid});
    removalButton.off('click');
    removalButton.click(function () {
        removeClicked(host);
    });
    cell.off('click');
    cell.click(function () {
        hostChosen(host);
    });
    $(outerDiv).append(cell);
    if (!ismDNSDiscovered) {
        // we don't have the option to delete mDNS hosts.  So don't show it to the user.
        $(outerDiv).append(removalButton);        
    }
    $('#host-grid').append(outerDiv);
    hosts[host.serverUid] = host;
}

function removeClicked(host) {
    var deleteHostDialog = document.querySelector('#deleteHostDialog');
    document.getElementById('deleteHostDialogText').innerHTML =
    ' Are you sure you want to delete ' + host.hostname + '?';
    deleteHostDialog.showModal();

    $('#cancelDeleteHost').off('click');
    $('#cancelDeleteHost').on('click', function () {
        deleteHostDialog.close();
    });

    // locally remove the hostname/ip from the saved `hosts` array.
    // note: this does not make the host forget the pairing to us.
    // this means we can re-add the host, and will still be paired.
    $('#continueDeleteHost').off('click');
    $('#continueDeleteHost').on('click', function () {
        var deleteHostDialog = document.querySelector('#deleteHostDialog');
        $('#host-container-' + host.serverUid).remove();
        delete hosts[host.serverUid]; // remove the host from the array;
        saveHosts();
        deleteHostDialog.close();
    });
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
function showApps(host) {
    if(!host || !host.paired) {  // safety checking. shouldn't happen.
        console.log('Moved into showApps, but `host` did not initialize properly! Failing.');
        return;
    }
    console.log(host);
    $('#quitCurrentApp').show();
    $("#gameList .game-container").remove();

    // Show a spinner while the applist loads
    $('#naclSpinnerMessage').text('Loading apps...');
    $('#naclSpinner').css('display', 'inline-block');

    host.getAppList().then(function (appList) {
        // if game grid is populated, empty it
        $("div.game-container").remove();

        $('#naclSpinner').hide();
        $("#game-grid").show();

        appList.forEach(function (app) {
            host.getBoxArt(app.id).then(function (resolvedPromise) {
                // put the box art into the image holder
                if ($('#game-' + app.id).length === 0) {
                    // double clicking the button will cause multiple box arts to appear.
                    // to mitigate this we ensure we don't add a duplicate.
                    // This isn't perfect: there's lots of RTTs before the logic prevents anything
                    var imageBlob =  new Blob([resolvedPromise], {type: "image/png"});
                    var outerDiv = $("<div>", {class: 'game-container mdl-card mdl-shadow--4dp', id: 'game-'+app.id, backgroundImage: URL.createObjectURL(imageBlob) });
                    $(outerDiv).append($("<img \>", {src: URL.createObjectURL(imageBlob), id: 'game-'+app.id, name: app.title }));
                    $(outerDiv).append($("<div>", {class: "game-title", html: $("<span>", {html: app.title} )}));
                    $("#game-grid").append(outerDiv);


                    // $("#gameList").append($("<div>", {html:$("<img \>", {src: URL.createObjectURL(imageBlob), id: 'game-'+app.id, name: app.title }), class: 'box-art mdl-cell mdl-cell--3-col'}).append($("<span>", {html: app.title, class:"game-title"})));
                    $('#game-'+app.id).on('click', function () {
                        startGame(host, app.id);
                    });

                    // apply CSS stylization to indicate whether the app is active
                    stylizeBoxArt(host, app.id);
                }

            }, function (failedPromise) {
                console.log('Error! Failed to retrieve box art for app ID: ' + app.id + '. Returned value was: ' + failedPromise)
                console.log('failed host object: ');
                console.log(host.toString());

                if ($('#game-' + app.id).length === 0) {
                    // double clicking the button will cause multiple box arts to appear.
                    // to mitigate this we ensure we don't add a duplicate.
                    // This isn't perfect: there's lots of RTTs before the logic prevents anything
                    var outerDiv = $("<div>", {class: 'game-container mdl-card mdl-shadow--4dp', id: 'game-'+app.id, backgroundImage: "static/res/no_app_image.png" });
                    $(outerDiv).append($("<img \>", {src: "static/res/no_app_image.png", id: 'game-'+app.id, name: app.title }));
                    $(outerDiv).append($("<div>", {class: "game-title", html: $("<span>", {html: app.title} )}));
                    $("#game-grid").append(outerDiv);

                    $('#game-'+app.id).on('click', function () {
                        startGame(host, app.id);
                    });

                    // apply CSS stylization to indicate whether the app is active
                    stylizeBoxArt(host, app.id);
                }
            });
        });
    }, function (failedAppList) {
        $('#naclSpinner').hide();

        console.log('Failed to get applist from host: ' + host.hostname);
        console.log('failed host object: ');
        console.log(host.toString());
    });

    showAppsMode();
}

// set the layout to the initial mode you see when you open moonlight
function showHostsAndSettingsMode() {
    console.log('entering show hosts and settings mode.');
    $("#main-navigation").show();
    $(".nav-menu-parent").show();
    $("#externalAudioBtn").show();
    $("#main-content").children().not("#listener, #loadingSpinner, #naclSpinner").show();
    $('#game-grid').hide();
    $('#backIcon').hide();
    $('#quitCurrentApp').hide();
    $("#main-content").removeClass("fullscreen");
    $("#listener").removeClass("fullscreen");
    // We're no longer in a host-specific screen.  Null host, and add it back to the polling list
    if(api) {
        beginBackgroundPollingOfHost(api);
        api = null;  // and null api
    }
}

function showAppsMode() {
    console.log("entering show apps mode.");
    $('#backIcon').show();
    $("#main-navigation").show();
    $("#main-content").children().not("#listener, #loadingSpinner, #naclSpinner").show();
    $("#streamSettings").hide();
    $(".nav-menu-parent").hide();
    $("#externalAudioBtn").hide();
    $("#host-grid").hide();
    $("#settings").hide();
    $("#main-content").removeClass("fullscreen");
    $("#listener").removeClass("fullscreen");
}


// start the given appID.  if another app is running, offer to quit it.
// if the given app is already running, just resume it.
function startGame(host, appID) {
    if(!host || !host.paired) {
        console.log('attempted to start a game, but `host` did not initialize properly. Failing!');
        return;
    }

    // refresh the server info, because the user might have quit the game.
    host.refreshServerInfo().then(function (ret) {
        host.getAppById(appID).then(function (appToStart) {

            if(host.currentGame != 0 && host.currentGame != appID) {
                host.getAppById(host.currentGame).then(function (currentApp) {
                    var quitAppDialog = document.querySelector('#quitAppDialog');
                    document.getElementById('quitAppDialogText').innerHTML = 
                        currentApp.title + ' is already running. Would you like to quit ' +
                        currentApp.title + '?';
                    quitAppDialog.showModal();
                    $('#cancelQuitApp').off('click');
                    $('#cancelQuitApp').on('click', function () {
                        quitAppDialog.close();
                        console.log('closing app dialog, and returning');
                    });
                    $('#continueQuitApp').off('click');
                    $('#continueQuitApp').on('click', function () {
                        console.log('stopping game, and closing app dialog, and returning');
                        stopGame(host, function () {
                            // please oh please don't infinite loop with recursion
                            startGame(host, appID);
                        });
                        quitAppDialog.close();
                    });

                    return;
                }, function (failedCurrentApp) {
                    console.log('ERROR: failed to get the current running app from host!');
                    console.log('Returned error was: ' + failedCurrentApp);
                    console.log('failed host object: ');
                    console.log(host.toString());
                    return;
                });
                return;
            }

            var frameRate = $('#selectFramerate').data('value').toString();
            var streamWidth = $('#selectResolution').data('value').split(':')[0];
            var streamHeight = $('#selectResolution').data('value').split(':')[1];
            // we told the user it was in Mbps. We're dirty liars and use Kbps behind their back.
            var bitrate = parseInt($("#bitrateSlider").val()) * 1000;
            console.log('startRequest:' + host.address + ":" + streamWidth + ":" + streamHeight + ":" + frameRate + ":" + bitrate);

            var rikey = generateRemoteInputKey();
            var rikeyid = generateRemoteInputKeyId();

            $('#loadingMessage').text('Starting ' + appToStart.title + '...');
            playGameMode();

            if(host.currentGame == appID) { // if user wants to launch the already-running app, then we resume it.
                return host.resumeApp(rikey, rikeyid).then(function (ret) {
                    sendMessage('startRequest', [host.address, streamWidth, streamHeight, frameRate,
                            bitrate.toString(), rikey, rikeyid.toString(), host.appVersion]);
                }, function (failedResumeApp) {
                    console.log('ERROR: failed to resume the app!');
                    console.log('Returned error was: ' + failedResumeApp);
                    return;
                });
            }

            var remote_audio_enabled = $("#remoteAudioEnabledSwitch").parent().hasClass('is-checked') ? 1 : 0;

            host.launchApp(appID,
                    streamWidth + "x" + streamHeight + "x" + frameRate,
                    1, // Allow GFE to optimize game settings
                    rikey, rikeyid,
                    remote_audio_enabled, // Play audio locally too?
                    0x030002 // Surround channel mask << 16 | Surround channel count
                    ).then(function (ret) {
                sendMessage('startRequest', [host.address, streamWidth, streamHeight, frameRate,
                        bitrate.toString(), rikey, rikeyid.toString(), host.appVersion]);
            }, function (failedLaunchApp) {
                console.log('ERROR: failed to launch app with appID: ' + appID);
                console.log('Returned error was: ' + failedLaunchApp);
                return;
            });

        });
    });
}

function playGameMode() {
    console.log("entering play game mode");
    isInGame = true;

    $("#main-navigation").hide();
    $("#main-content").children().not("#listener, #loadingSpinner").hide();
    $("#main-content").addClass("fullscreen");

    chrome.app.window.current().fullscreen();
    fullscreenNaclModule();
    $('#loadingSpinner').css('display', 'inline-block');

}

// Maximize the size of the nacl module by scaling and resizing appropriately
function fullscreenNaclModule() {
    var streamWidth = $('#selectResolution').data('value').split(':')[0];
    var streamHeight = $('#selectResolution').data('value').split(':')[1];
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
            $('#cancelQuitApp').off('click');
            $('#cancelQuitApp').on('click', function () {
                console.log('closing app dialog, and returning');
                quitAppDialog.close();
            });
            $('#continueQuitApp').off('click');
            $('#continueQuitApp').on('click', function () {
                console.log('stopping game, and closing app dialog, and returning');
                stopGame(api);
                quitAppDialog.close();
            });

        });
    }
}

function stopGame(host, callbackFunction) {
    isInGame = false;

    if (!host.paired) {
        return;
    }

    host.refreshServerInfo().then(function (ret) {
        host.getAppById(host.currentGame).then(function (runningApp) {
            if (!runningApp) {
                snackbarLog('Nothing was running');
                return;
            }
            var appName = runningApp.title;
            snackbarLog('Stopping ' + appName);
            host.quitApp().then(function (ret2) { 
                host.refreshServerInfo().then(function (ret3) { // refresh to show no app is currently running.
                    showAppsMode();
                    stylizeBoxArt(host, runningApp.id);
                    if (typeof(callbackFunction) === "function") callbackFunction();
                }, function (failedRefreshInfo2) {
                    console.log('ERROR: failed to refresh server info!');
                    console.log('Returned error was: ' + failedRefreshInfo2);
                    console.log('failed server was: ' + host.toString());
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
    var chosenResolution = $(this).data('value');
    $('#selectResolution').text($(this).text()).data('value', chosenResolution);
    storeData('resolution', chosenResolution, null);
    updateDefaultBitrate();
}

function saveFramerate() {
    var chosenFramerate = $(this).data('value');
    $('#selectFramerate').text($(this).text()).data('value', chosenFramerate);
    storeData('frameRate', chosenFramerate, null);
    updateDefaultBitrate();
}

// storing data in chrome.storage takes the data as an object, and shoves it into JSON to store
// unfortunately, objects with function instances (classes) are stripped of their function instances when converted to a raw object
// so we cannot forget to revive the object after we load it.
function saveHosts() {
    for(var hostUID in hosts) {
        // slim the object down to only store the necessary bytes, because we have limited storage
        hosts[hostUID]._prepareForStorage();
    }
    storeData('hosts', hosts, null);
}

function saveBitrate() {
    storeData('bitrate', $('#bitrateSlider').val(), null);
}

function saveRemoteAudio() {
    // MaterialDesignLight uses the mouseup trigger, so we give it some time to change the class name before
    // checking the new state
    setTimeout(function() {
        var remoteAudioState = $("#remoteAudioEnabledSwitch").parent().hasClass('is-checked');
        console.log('saving remote audio state : ' + remoteAudioState);
        storeData('remoteAudio', remoteAudioState, null);
    }, 100);
}

function updateDefaultBitrate() {
    var res = $('#selectResolution').data('value');
    var frameRate = $('#selectFramerate').data('value').toString();

    if (res ==="1920:1080") {
        if (frameRate === "30") { // 1080p, 30fps
            $('#bitrateSlider')[0].MaterialSlider.change('10');
        } else { // 1080p, 60fps
            $('#bitrateSlider')[0].MaterialSlider.change('20');
        }
    } else if (res === "1280:720") {
        if (frameRate === "30") { // 720, 30fps
            $('#bitrateSlider')[0].MaterialSlider.change('5');
        } else { // 720, 60fps
            $('#bitrateSlider')[0].MaterialSlider.change('10');
        }
    } else if (res === "3840:2160") {
        if (frameRate === "30") { // 2160p, 30fps
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
    console.log('Window loaded.');
    // don't show the game selection div
    $('#gameSelection').css('display', 'none');

    loadWindowState();

    if(chrome.storage) {
        // load stored resolution prefs
        chrome.storage.sync.get('resolution', function(previousValue) {
            if(previousValue.resolution != null) {
                $('.resolutionMenu li').each(function () {
                    if ($(this).data('value') === previousValue.resolution) {
                        $('#selectResolution').text($(this).text()).data('value', previousValue.resolution);
                    }
                });
            }
        });

        // Load stored remote audio prefs
        chrome.storage.sync.get('remoteAudio', function(previousValue) {
            if(previousValue.remoteAudio == null) {
                document.querySelector('#externalAudioBtn').MaterialIconToggle.check();
                return;
            } else if(previousValue.remoteAudio == false) {
                document.querySelector('#externalAudioBtn').MaterialIconToggle.uncheck();
            }  else {
                document.querySelector('#externalAudioBtn').MaterialIconToggle.check();
            }
        });

        // load stored framerate prefs
        chrome.storage.sync.get('frameRate', function(previousValue) {
            if(previousValue.frameRate != null) {
                $('.framerateMenu li').each(function () {
                    if ($(this).data('value') === previousValue.frameRate) {
                        $('#selectFramerate').text($(this).text()).data('value', previousValue.frameRate);
                    }
                });
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
            } else {
                myUniqueid = uniqueid();
                storeData('uniqueid', myUniqueid, null);
            }
        });

        // load previously connected hosts, which have been killed into an object, and revive them back into a class
        chrome.storage.sync.get('hosts', function(previousValue) {
            hosts = previousValue.hosts != null ? previousValue.hosts : {};
            for(var hostUID in hosts) { // programmatically add each new host.
                var revivedHost = new NvHTTP(hosts[hostUID].address, myUniqueid, hosts[hostUID].userEnteredAddress);
                revivedHost.serverUid = hosts[hostUID].serverUid;
                revivedHost.externalIP = hosts[hostUID].externalIP;
                revivedHost.hostname = hosts[hostUID].hostname;
                addHostToGrid(revivedHost);
            }
            console.log('Loaded previously connected hosts.');
        });
    }
}


window.onload = onWindowLoad;
