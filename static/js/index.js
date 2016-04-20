var target = "";
var hosts = [];
var pairingCert;
var myUniqueid;
var api;

// Called by the common.js module.
function attachListeners() {
    $('#selectResolution').on('change', saveResolution);
    $('#selectFramerate').on('change', saveFramerate);
    $('#bitrateSlider').on('input', updateBitrateField); // input occurs every notch you slide
    $('#bitrateSlider').on('change', saveBitrate); // change occurs once the mouse lets go.
    $('#hostChosen').on('click', hostChosen);
    $('#forgetHost').on('click', forgetHost);
    $('#cancelPairingDialog').on('click', pairingPopupCanceled);
    $('#selectGame').on('change', gameSelectUpdated);
    $('#startGameButton').on('click', startSelectedGame);
    $('#cancelReplaceApp').on('click', cancelReplaceApp);
    $('#continueReplaceApp').on('click', continueReplaceApp);
    $('#quitGameButton').on('click', stopGame);
    $(window).resize(fullscreenNaclModule);
}

function snackbarLog(givenMessage) {
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
            sendMessage('httpInit', [pairingCert.cert, pairingCert.privateKey, myUniqueid]);
        }, function (failedInit) {
            console.log('ERROR: failed httpInit!');
            console.log('Returned error was: ' + failedInit);
        });
    }
    else {
        sendMessage('httpInit', [pairingCert.cert, pairingCert.privateKey, myUniqueid]).then(function (ret) {
            snackbarLog('Initialization complete.');
        }, function (failedInit) {
            console.log('ERROR: failed httpInit!');
            console.log('Returned error was: ' + failedInit);
        });
    }
}

// because the user can change the target host at any time, we continually have to check
function updateTarget() {
    target = $('#GFEHostIPField').val();
    if (target == null || target == "") {
        target = $("#selectHost option:selected").val();
    }
    
    if(api && api.address != target) {
        api = new NvHTTP(target, myUniqueid);
    }
}

// we want the user to progress through the streaming process
// but to save from the PITA of inter-chrome-app-page JS message passing,
// I'm opting to do it in a single page, and keep the data around.
function hideAllWorkflowDivs() {
    $('#streamSettings').css('display', 'inline-block');
    $('#hostSettings').css('display', 'inline-block');
    $('#gameSelection').css('display', 'none');
    // do NOT hide the nacl module. you can't interact with it then
}

// pair to the given hostname or IP
function pairTo(targetHost) {
    if(!pairingCert) {
        snackbarLog('ERROR: cert has not been generated yet. Is NaCL initialized?');
        console.log("User wants to pair, and we still have no cert. Problem = very yes.");
        return;
    }

    if(!api) {
        api = new NvHTTP(targetHost, myUniqueid);
    }

    if(api.paired) {
        return;
    }

    $('#pairButton').html('Pairing...');
    snackbarLog('Attempting pair to: ' + targetHost);
    var randomNumber = String("0000" + (Math.random()*10000|0)).slice(-4);
    var pairingDialog = document.querySelector('#pairingDialog');
    $('#pairingDialogText').html('Please enter the number ' + randomNumber + ' on the GFE dialog on the computer.  This dialog will be dismissed once complete');
    pairingDialog.showModal();
    console.log('sending pairing request to ' + targetHost + ' with random number ' + randomNumber);

    api.pair(randomNumber).then(function (paired) {
        if (!paired) {
            if (api.currentGame != 0) {
                snackbarLog(targetHost + ' is already in game. Cannot pair!');
                $('#pairButton').html('Pairing Failed');
                $('#pairingDialogText').html('Error: ' + targetHost + ' is in app.  Cannot pair until the app is stopped.');
            } else {
                snackbarLog('Pairing failed');
                $('#pairButton').html('Pairing Failed');
                $('#pairingDialogText').html('Error: failed to pair with ' + targetHost + '.  failure reason unknown.');
            }
            return;
        }
        
        $('#pairButton').html('Paired');
        snackbarLog('Pairing successful');
        pairingDialog.close();
        
        var hostSelect = $('#selectHost')[0];
        for(var i = 0; i < hostSelect.length; i++) { // check if we already have the host.
            if (hostSelect.options[i].value == targetHost) return;
        }

        var opt = document.createElement('option');
        opt.appendChild(document.createTextNode(targetHost));
        opt.value = targetHost;
        $('#selectHost').append(opt);
        hosts.push(targetHost);
        saveHosts();
    }, function (failedPairing) {
        snackbarLog('Failed pairing to: ' + targetHost);
        console.log('pairing failed, and returned ' + failedPairing);
    });
}

function hostChosen() {
    updateTarget();

    if(!api || api.address != target) {
        api = new NvHTTP(target, myUniqueid);
    }

    api.refreshServerInfo().then(function (ret) {
        if(!api.paired) {
            pairTo(target);
        }
        if(hosts.indexOf(target) < 0) { // we don't have this host in our list. add it, and save it.
            var opt = document.createElement('option');
            opt.appendChild(document.createTextNode(target));
            opt.value = target;
            $('#selectHost').append(opt);
            hosts.push(target);
            saveHosts();
            $('#GFEHostIPField').val(''); // eat the contents of the textbox
            $('#GFEHostIPField').parent().removeClass('is-dirty');
        }
        showApps();
    }, function (failedRefreshInfo) {
        snackbarLog('Failed to connect to ' + target + '! Are you sure the host is on?');
        console.log('Returned error was: ' + failedRefreshInfo);
    });
}

// locally remove the hostname/ip from the saved `hosts` array.
// note: this does not make the host forget the pairing to us.
// this means we can re-add the host, and will still be paired.
function forgetHost() {
    updateTarget();
    $("#selectHost option:selected").remove();
    hosts.splice(hosts.indexOf(target), 1); // remove the host from the array;
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
    $("#main-content").children().not("#listener").show();
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
    // do NOT update the target.
    // we're just grabbing the currently selected option from #selectGame, and feeding it into NvHTTP
    // if we need to reconnect to the target, and `target` has been updated, we can pass the appID we listed from the previous target
    // then everyone's sad. So we won't do that.  Because the only way to see the startGame button is to list the apps for the target anyways.
    if(!api || !api.paired) {
        console.log('attempted to start a game, but `api` did not initialize properly. Failing!');
        return;
    }

    var appID = $("#selectGame").val();  // app that the user wants to play

    // refresh the server info, because the user might have quit the game.
    api.refreshServerInfo().then(function (ret) {
        if(api.currentGame != 0 && api.currentGame != appID) {
            api.getAppById(api.currentGame).then(function (currentApp) {
                snackbarLog('Error: ' + target + ' is already in app: ' + currentApp.title);

                var replaceAppDialog = document.querySelector('#replaceAppDialog');
                document.getElementById('replaceAppDialogText').innerHTML = 
                    'You wanted to start a new game. ' + currentApp.title + ' is already running. Would you like to stop ' + currentApp.title + ', then start the new game?';
                replaceAppDialog.showModal();
                return;
            }, function (failedCurrentApp) {
                console.log('ERROR: failed to get the current running app from host!');
                console.log('Returned error was: ' + failedCurrentApp);
                return;
            });
            return;
        }

        snackbarLog('Starting app: ' + $('#selectGame option:selected').text());

        var frameRate = $("#selectFramerate").val();
        var streamWidth = $('#selectResolution option:selected').val().split(':')[0];
        var streamHeight = $('#selectResolution option:selected').val().split(':')[1];
        // we told the user it was in Mbps. We're dirty liars and use Kbps behind their back.
        var bitrate = parseInt($("#bitrateSlider").val()) * 1024;
        console.log('startRequest:' + target + ":" + streamWidth + ":" + streamHeight + ":" + frameRate + ":" + bitrate);

        var rikey = '00000000000000000000000000000000';
        var rikeyid = 0;

        if(api.currentGame == appID) // if user wants to launch the already-running app, then we resume it.
            return api.resumeApp(rikey, rikeyid).then(function (ret) {
                sendMessage('startRequest', [target, streamWidth, streamHeight, frameRate, bitrate.toString(), api.serverMajorVersion.toString()]);
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
                sendMessage('startRequest', [target, streamWidth, streamHeight, frameRate, bitrate.toString(), api.serverMajorVersion.toString()]);
            }, function (failedLaunchApp) {
                console.log('ERROR: failed to launch app with appID: ' + appID);
                console.log('Returned error was: ' + failedLaunchApp);
                return;
            });
    });
    console.log('finished startSelectedGame.');
    playGameMode();
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
    $("#main-content").children().not("#listener").hide();
    $("#main-content").addClass("fullscreen");
    $("#listener").addClass("fullscreen");
    fullscreenNaclModule();
    $("body").css('backgroundColor', 'black');
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
    } else if (res.lastIndexOf("2160:3840", 0) === 0) {
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
            $('#selectFramerate').val(previousValue.frameRate != null ? previousValue.frameRate : '30');
        });
        // load previously connected hosts
        chrome.storage.sync.get('hosts', function(previousValue) {
            hosts = previousValue.hosts != null ? previousValue.hosts : [];
            for(var i = 0; i < hosts.length; i++) { // programmatically add each new host.
                var opt = document.createElement('option');
                opt.appendChild(document.createTextNode(hosts[i]));
                opt.value = hosts[i];
                $('#selectHost').append(opt);
            }
        });
        // load stored bitrate prefs
        chrome.storage.sync.get('bitrate', function(previousValue) {
            $('#bitrateSlider')[0].MaterialSlider.change(previousValue.bitrate != null ? previousValue.bitrate : '5');
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
            var ip = Object.keys(finder.byService_['_nvstream._tcp'])[0];
            if (finder.byService_['_nvstream._tcp'][ip]) {
                $('#GFEHostIPField').val(ip);
                $('#GFEHostIPField').parent().addClass('is-dirty'); // mark it as dirty to float the textfield label
                updateTarget();
            }
        }
    });
}


window.onload = onWindowLoad;
