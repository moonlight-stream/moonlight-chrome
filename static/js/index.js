var selectedHost = null; //should only be set if we're in a host-specific screen. on the initial screen it should always be null.
var myUniqueid = null;
var pairingCert = null;
var hosts = null;
var updateHostsTimer = null;

function startUpdateHosts() {
    if (!hosts)
        hosts = {};
    
    findNvService(function (finder, opt_error) {
        alreadyUpdated = [];
        
        if (finder.byService_['_nvstream._tcp']) {
            var ips = Object.keys(finder.byService_['_nvstream._tcp']);
            
            for (var i in ips) {
                var ip = ips[i];
                
                if (finder.byService_['_nvstream._tcp'][ip]) {
                    var host = new NvHTTP(ip, myUniqueid);
                    host.refreshServerInfo().then(function () {
                        if (host.serverUid) {
                            host.online = true;
                            
                            if (!hosts[host.serverUid]) {
                                addHostToGrid(host, true);
                            }
                            
                            alreadyUpdated.push(host.serverUid);
                        }
                    }, function () { /* do nothing */ });
                }
            }
        }
        
        for (var uid in hosts) {
            if (!(uid in alreadyUpdated)) {
                var host = hosts[uid];
                
                if (host) {
                    host.refreshServerInfo().then(function () {
                        if (host.serverUid) {
                            host.online = true;
                        }
                        else {
                            host.online = false;
                            removeHostFromGrid(host);
                        }
                    }, function () {
                        host.online = false;
                        removeHostFromGrid(host);
                    });
                }
            }
        }
    });
    
    updateHostsTimer = setTimeout(startUpdateHosts, 5000);
}

function stopUpdateHosts() {
    if (updateHostsTimer) {
        clearTimeout(updateHostsTimer);
    }
}

function onWindowLoad() {
    moduleLoading();
    
    function saveBitrateField() {
        storeData('bitrate', $('#bitrateSlider').val());
    }
    
    function updateBitrateField() {
        $('#bitrateField').html($('#bitrateSlider').val() + ' Mbps');
    }
    
    function updateDefaultBitrate() {
        var res = $('#selectResolution').val();
        var frameRate = $('#selectFramerate').val();
        var slider = $('#bitrateSlider')[0].MaterialSlider;
        
        if (res.lastIndexOf('1920:1080', 0) === 0) {
            if (frameRate.lastIndexOf('30', 0) === 0) { // 1080p, 30fps
                slider.change('10');
            }
            else { // 1080p, 60fps
                slider.change('20');
            }
        }
        else if (res.lastIndexOf('1280:720') === 0) {
            if (frameRate.lastIndexOf('30', 0) === 0) { // 720, 30fps
                slider.change('5');
            }
            else { // 720, 60fps
                slider.change('10');
            }
        }
        else if (res.lastIndexOf('3840:2160', 0) === 0) {
            if (frameRate.lastIndexOf('30', 0) === 0) { // 2160p, 30fps
                slider.change('40');
            }
            else { // 2160p, 60fps
                slider.change('80');
            }
        }
        else {  // unrecognized option. In case someone screws with the JS to add custom resolutions
            slider.change('10');
        }
        
        updateBitrateField();
        saveBitrateField();
    }
    
    if(chrome.storage) {
        chrome.storage.sync.get('resolution', function(value) {
            $('#selectResolution').val(value.resolution != null ? value.resolution : '1280:720');
        });
        
        chrome.storage.sync.get('remoteAudio', function(value) {
            if(value.remoteAudio == null) {
                $('#remoteAudioEnabledSwitchContainer')[0].MaterialSwitch.off();
            }
            else if(value.remoteAudio == false) {
                $('#remoteAudioEnabledSwitchContainer')[0].MaterialSwitch.off();
            }
            else {
                $('#remoteAudioEnabledSwitchContainer')[0].MaterialSwitch.on();
            }
        });
        
        chrome.storage.sync.get('frameRate', function(value) {
            $('#selectFramerate').val(value.frameRate != null ? value.frameRate : '60');
        });
        
        chrome.storage.sync.get('bitrate', function(previousValue) {
            $('#bitrateSlider')[0].MaterialSlider.change(previousValue.bitrate != null ? previousValue.bitrate : '10');
            updateBitrateField();
        });
        
        chrome.storage.sync.get('cert', function(value) {
            if (value.cert != null) {
                pairingCert = value.cert;
            }
        });
        
        chrome.storage.sync.get('uniqueid', function(value) {
            if (value.uniqueid != null) {
                myUniqueid = value.uniqueid;
            }
        });
        
        chrome.storage.sync.get('hosts', function(value) {
            hosts = value.hosts != null ? value.hosts : {};
            
            for(hostUID in hosts) {
                var revivedHost = new NvHTTP(hosts[hostUID].address, myUniqueid, hosts[hostUID].userEnteredAddress);
                revivedHost.serverUid = hosts[hostUID].serverUid;
                revivedHost.externalIP = hosts[hostUID].externalIP;
                revivedHost.hostname = hosts[hostUID].hostname;
                
                addHostToGrid(revivedHost);
            }
        });
    }
    
    $('#selectResolution').on('change', function () {
        storeData('resolution', $('#selectResolution').val());
        updateDefaultBitrate();
    });
    
    $('#selectFramerate').on('change', function () {
        storeData('frameRate', $('#selectFramerate').val());
        updateDefaultBitrate();
    });
    
    $('#bitrateSlider').on('input', updateBitrateField);
    
    $('#bitrateSlider').on('change', saveBitrateField);
    
    $('#remoteAudioEnabledSwitch').on('click', function () {
        storeData('remoteAudio', !$('#remoteAudioEnabledSwitch').parent().hasClass('is-checked'));
    });
    
    $('#addHostCell').on('click', addHostDialog);
    $('#backIcon').on('click', uiHostsMode);
    $('#quitCurrentApp').on('click', onClickStopCurrentGame);
    
    $(window).resize(fullscreenNaclModule);
    
    chrome.app.window.current().onMaximized.addListener(function () {
        /* 
        * When the user clicks the maximize button on the window,
        * FIRST restore it to the previous size, then fullscreen it to the whole screen
        * this prevents the previous window size from being 'maximized',
        * and allows us to functionally retain two window sizes
        * so that when the user hits `esc`, they go back to the 'restored' size, 
        * instead of 'maximized', which would immediately go to fullscreen
        */
        chrome.app.window.current().restore();
        chrome.app.window.current().fullscreen();
    });
}

function fullscreenNaclModule() {
    var streamWidth = $('#selectResolution option:selected').val().split(':')[0];
    var streamHeight = $('#selectResolution option:selected').val().split(':')[1];
    var screenWidth = window.innerWidth;
    var screenHeight = window.innerHeight;
    
    var xRatio = screenWidth / streamWidth;
    var yRatio = screenHeight / streamHeight;
    
    var zoom = Math.min(xRatio, yRatio);
    
    var module = $('#nacl_module')[0];
    module.width = zoom * streamWidth;
    module.height = zoom * streamHeight;
    module.style.paddingTop = ((screenHeight - module.height) / 2) + 'px';
}

function saveHosts() {
    for(hostUid in hosts) {
        hosts[hostUid]._prepareForStorage();
    }
    
    storeData('hosts', hosts, null);
}

function storeData(key, data) {
    var obj = {};
    obj[key] = data;
    
    console.log('Saving ' + key + ': ' + data);
    
    if(chrome.storage)
        chrome.storage.sync.set(obj, null);
}

function moduleLoading() {
    uiHostsMode();
    uiLoadingMode('Loading Moonlight plugin...');
}

function moduleDidLoad() {
    initializeModule().then(function (init) {
        if (init) {
            uiLoadingMode();
            uiHostsMode();
        }
    });
}

function initializeModule() {
    return new Promise(function (resolve, reject) {
        if(!myUniqueid) {
            console.log('Failed to get uniqueId. We should have already generated one. Regenerating...');
            myUniqueid = uniqueid();
            storeData('uniqueid', myUniqueid, null);
        }
        
        function httpInit(c, uid) {
            sendMessage('httpInit', [c.cert, c.privateKey, uid]).then(function (ret) {
                resolve(true);
            }, function (failedInit) {
                console.error('Failed httpInit! Returned error was: ' + failedInit);
                resolve(false);
            });
        }

        if(!pairingCert) {
            console.log('Failed to load local cert. Generating new one');   
            
            sendMessage('makeCert', []).then(function (cert) {
                console.log('Generated new cert.');
                storeData('cert', cert, null);
                pairingCert = cert;
                
                httpInit(pairingCert, myUniqueid);
            }, function (failedCert) {
                console.error('Failed to generate new cert! Returned error was: ' + failedCert);
                resolve(false);
            });
        }
        else {
            httpInit(pairingCert, myUniqueid);
        }
    });
}

function uiLoadingMode(txt = '') {
    if(txt) {
        $('#main-content').children().not('#listener, #naclSpinner').toggle();
        $('#naclSpinnerMessage').text(txt);
        $('#naclSpinner').css('display', 'inline-block');
    }
    else {
        $('#main-content').children().not('#listener, #naclSpinner').toggle();
        $('#naclSpinner').hide();
        $('#naclSpinner').css('display', 'none');
    }
}

function uiHostsMode() {
    $('#backIcon').hide();
    $('#quitCurrentApp').hide();
    $('.mdl-layout__header').show();
    $('#main-content').children().not('#listener, #loadingSpinner, #naclSpinner').show();
    $('#game-grid').hide();
    $('#main-content').removeClass('fullscreen');
    $('#listener').removeClass('fullscreen');
    $('body').css('backgroundColor', 'white');
    
    selectedHost = null;
    startUpdateHosts();
}

function uiAppsMode() {
    $('#backIcon').show();
    $('.mdl-layout__header').show();
    $('#main-content').children().not('#listener, #loadingSpinner, #naclSpinner').show();
    $('#streamSettings').hide();
    $('#hostSettings').hide();
    $('#main-content').removeClass('fullscreen');
    $('#listener').removeClass('fullscreen');
    $('body').css('backgroundColor', 'white');
    
    stopUpdateHosts();
}

function uiPlayGameMode() {
    $('.mdl-layout__header').hide();
    $('#main-content').children().not('#listener, #loadingSpinner').hide();
    $('#main-content').addClass('fullscreen');
    fullscreenNaclModule();
    $('body').css('backgroundColor', 'black');
    $('#loadingSpinner').css('display', 'inline-block');
    
    chrome.app.window.current().fullscreen();
}

function uiShowAppsList() {
    if (!selectedHost) {
        snackbarLog('You must connect to server first!');
        return;
    }
    
    $('#game-grid').empty();
    
    if (selectedHost.currentGame != 0) {
        $('#quitCurrentApp').show();
    }
    
    uiAppsMode();
    uiLoadingMode('Loading apps...');
    
    selectedHost.getAppList().then(function (appList) {
        uiLoadingMode();
        
        appList.forEach(function (app) {
            getArtBoxFromCache(selectedHost, app.id).then(function (imgData) {
                if (!imgData)
                    return;
                
                if ($('#game-' + app.id).length === 0) {
                    var imageBlob =  new Blob([imgData], {type: 'image/png'});
                    
                    // We need a better way to do this
                    $('#game-grid').append($('<div>', {
                        html: $('<img \>', {
                            src: URL.createObjectURL(imageBlob),
                            id: 'game-' + app.id,
                            name: app.title
                            }),
                        class: 'box-art mdl-cell mdl-cell--3-col'
                    }).append($('<span>', {
                        html: app.title,
                        class: 'game-title'
                    })));
                    
                    $('#game-' + app.id).on('click', function () {
                        onClickStartApp(selectedHost, app.id);
                    });
                    
                    if (selectedHost.currentGame === app.id) {
                        $('#game-' + app.id).removeClass('not-current-game');
                        $('#game-' + app.id).addClass('current-game');
                    }
                    else {
                        $('#game-' + app.id).removeClass('current-game');
                        $('#game-' + app.id).addClass('not-current-game');
                    }
                }
            }, function (err) {
                console.error('Failed to get app box art from host!');
            });
        });
    }, function (err) {
        uiLoadingMode();
        console.error('Failed to get the app list from host!');
    });
}

/*
* Get the art box from cache or load it from host if needed.
* Returns a Promise that will always resolve to the image data or null
*/
function getArtBoxFromCache(host, appId) {
    return new Promise(function (resolve, reject) {
        chrome.storage.local.get('artbox_' + appId, function (value) {
            var img = value['artbox_' + appId];
            if (img) {
                resolve(_base64ToArrayBuffer(img));
            }
            else {
                host.getBoxArt(appId).then(function (img) {
                    var obj = {}
                    obj['artbox_' + appId] = _arrayBufferToBase64(img);
                    chrome.storage.local.set(obj, null);
                    
                    resolve(img);
                }, function (err) {
                    resolve(null);
                });
            }
        });
    });
}

/*
* Opens a pairing dialog if needed.
* Returns a Promise that will always resolve to a boolean true if paired and false if not.
*/
function pairDialog(host) {
    return new Promise(function (resolve, reject) {
        if(!pairingCert) {
            console.error('Pairing: Certificate not loaded!');
            resolve(false);
            return;
        }
        
        if (host.paired) {
            resolve(true);
            return;
        }
        
        var randomNumber = String('0000' + (Math.random()*10000|0)).slice(-4);
        $('#pairingDialogText').html('Please enter the number ' + randomNumber + ' on the GFE dialog on the computer. This dialog will be dismissed once complete');
        
        var pairingDialog = $('#pairingDialog')[0];
        pairingDialog.showModal();
        
        $('#cancelPairingDialog').off('click');
        $('#cancelPairingDialog').on('click', function () {
            pairingDialog.close();
        });
        
        function showError() {
            console.error('Failed to pair\n' + host.toString());
        }
        
        console.log('Sending pairing request to ' + host.address + ' with random number ' + randomNumber);
        host.pair(randomNumber).then(function (paired) {
            if (!paired) {
                if (host.currentGame != 0) {
                    $('#pairingDialogText').html('Error! ' + host.address + ' is in app. Cannot pair until the app is stopped.');
                }
                else {
                    $('#pairingDialogText').html('Error! Failed to pair with ' + host.address);
                    showError();
                }
                
                resolve(false);
            }
            else {
                pairingDialog.close();
                resolve(true);
            }
        }, function (err) {
            console.error(err);
            showError();
            resolve(false);
        });
    });
}

/*
* Opens a close game dialog.
* Returns a Promise that will always resolve to a boolean true if the game was closed and false if not.
*/
function stopGameDialog(host, txt = '') {
    return new Promise(function (resolve, reject) {
        if (!host || !host.paired) {
            console.error('You must be paired with the server!');
            resolve(false);
            return;
        }
        
        if (host.currentGame === 0) {
            snackbarLog('Stop game: nothing was running!');
            resolve(false);
            return;
        }
        
        host.getAppById(host.currentGame).then(function (currentGame) {
            if (!txt)
                $('#quitAppDialogText').html('Are you sure you would like to quit ' + currentGame.title + '? Unsaved progress will be lost.');
            else
                $('#quitAppDialogText').html(txt);
            
            var quitAppDialog = $('#quitAppDialog')[0];
            quitAppDialog.showModal();
            
            $('#cancelQuitApp').off('click');
            $('#continueQuitApp').off('click');
            
            $('#cancelQuitApp').on('click', function () {
                resolve(false);
                quitAppDialog.close();
            });
            
            $('#continueQuitApp').on('click', function () {
                quitAppDialog.close();
                
                host.quitApp().then(function () {
                    resolve(true);
                }, function (err) {
                    console.error('Failed to close the current game! Returned error: ' + err);
                    resolve(false);
                });
            });
        });
    });
}

function addHostDialog() {
    var modal = $('#addHostDialog')[0];
    modal.showModal();
    
    $('#cancelAddHost').off('click');
    $('#continueAddHost').off('click');
    
    $('#cancelAddHost').on('click', function() {
        modal.close();
    });
    
    $('#continueAddHost').on('click', function () {
        var inputHost = $('#dialogInputHost').val();
        
        if (!inputHost) {
            snackbarLog('Please insert a host address!');
            return;
        }
        
        modal.close();
        var host = new NvHTTP(inputHost, myUniqueid, inputHost);
        
        pairDialog(host).then(function (paired) {
            if (paired) {
                addHostToGrid(host);
            }
            else {
                snackbarLog('Pairing to ' + inputHost + ' failed!');
            }
        });
    });
}

/*
* Opens a unpair dialog.
* Returns a Promise that will always resolve to a boolean.
*/
function unpairDialog(host) {
    return new Promise(function (resolve, reject) {
        $('#unpairHostDialogText').html('Are you sure you want like to unpair from ' + host.hostname + '?');
        
        var unpairHostDialog = $('#unpairHostDialog')[0];
        unpairHostDialog.showModal();
        
        $('#cancelUnpairHost').off('click');
        $('#continueUnpairHost').off('click');
        
        $('#cancelUnpairHost').on('click', function () {
            unpairHostDialog.close();
            resolve(false);
        });
        
        $('#continueUnpairHost').on('click', function () {
            unpairHostDialog.close();
            
            host.unpair().then(function () {
                resolve(true);
            }, function (err) {
                console.error('Failed to unpair from host. Returned error: ' + err);
                resolve(false);
            });
        });
    });
}

function addHostToGrid(host, ismDNSDiscovered = false) {
    // ugly
    var outerDiv = $('<div>', {class: 'host-container mdl-cell--3-col', id: 'host-container-' + host.serverUid });
    var cell = $('<div>', {class: 'mdl-cell mdl-cell--3-col host-cell mdl-button mdl-js-button mdl-js-ripple-effect', id: 'hostgrid-' + host.serverUid, html: host.hostname });
    var removalButton = $('<div>', {class: 'remove-host', id: 'removeHostButton-' + host.serverUid});
    $(cell).prepend($('<img>', {src: 'static/res/ic_desktop_windows_white_24px.svg'}));
    
    removalButton.off('click');
    cell.off('click');
    
    removalButton.click(function () {
        onClickUnpairHost(host);
    });
    
    cell.click(function () {
        onClickSelectHost(host);
    });
    
    $(outerDiv).append(cell);
    
    if (!ismDNSDiscovered) {
        $(outerDiv).append(removalButton);        
    }
    
    $('#host-grid').append(outerDiv);
    hosts[host.serverUid] = host;
    saveHosts();
}

function removeHostFromGrid(host) {
    $('#host-container-' + host.serverUid).remove();
    delete hosts[host.serverUid];
    saveHosts();
}

function onClickSelectHost(host) {
    if (!host.online) {
        return;
    }
    
    pairDialog(host).then(function (paired) {
        if (paired) {
            selectedHost = host;
            uiShowAppsList();
        }
        else {
            snackbarLog('You must pair first!');
        }
    });
}

function onClickUnpairHost(host) {
    unpairDialog(host).then(function (unpair) {
        if (unpair) {
            removeHostFromGrid(host);
            snackbarLog('Successfully unpaired from host!');
        }
        else {
            snackbarLog('Failed to unpair from host!');
        }
    });
}

function onClickStopCurrentGame() {
    stopGameDialog(selectedHost).then(function (stop) {
        if (stop) {
            snackbarLog('The current game was stopped!');
        }
        else {
            snackbarLog('Unable to stop the current game!');
        }
    });
}

function onClickStartApp(host, appId) {
    if (!host.online) {
        snackbarLog('Start app: host is offline!');
        return;
    }
    
    if (!host.paired) {
        snackbarLog('Start app: you must pair first!');
        return;
    }
    
    host.refreshServerInfo().then(function () {
        host.getAppById(appId).then(function (appToStart) {
            function startGame() {
                var frameRate = $('#selectFramerate').val();
                var streamWidth = $('#selectResolution option:selected').val().split(':')[0];
                var streamHeight = $('#selectResolution option:selected').val().split(':')[1];
                var bitrate = parseInt($('#bitrateSlider').val()) * 1000;
                var remote_audio_enabled = $('#remoteAudioEnabledSwitch').parent().hasClass('is-checked') ? 1 : 0;
                var rikey = generateRemoteInputKey();
                var rikeyid = generateRemoteInputKeyId();
                
                console.log('StartRequest:' + host.address + ':' + streamWidth + ':' + streamHeight + ':' + frameRate + ':' + bitrate);
                
                $('#loadingMessage').text('Starting ' + appToStart.title + '...');
                uiPlayGameMode();
                
                function startRequest() {
                    sendMessage('startRequest', [host.address, streamWidth, streamHeight, frameRate, bitrate.toString(), host.serverMajorVersion.toString(), rikey, rikeyid.toString()]);
                }
                
                if (host.currentGame == appId) {
                    host.resumeApp(rikey, rikeyid).then(function () {
                        startRequest();
                    }, function (err) {
                        snackbarLog('Failed to resume the app!');
                    });
                }
                else {
                    host.launchApp(appId,
                                   streamWidth + 'x' + streamHeight + 'x' + frameRate,
                                   1, // Allow GFE to optimize game settings
                                   rikey, rikeyid,
                                   remote_audio_enabled, // Play audio locally too?
                                   0x030002 // Surround channel mask << 16 | Surround channel count
                    ).then(function () {
                        startRequest();
                    }, function (err) {
                        snackbarLog('Failed to launch the app!');
                    });
                }
            }
            
            if (host.currentGame != 0 && host.currentGame != appId) {
                host.getAppById(host.currentGame).then(function (currentApp) {
                    stopGameDialog(host).then(function (stop) {
                        if (stop) {
                            snackbarLog(currentApp.title + ' closed!');
                            startGame();
                        }
                        else {
                            snackbarLog('You must close the current app first!');
                        }
                    });
                }, function (err) {
                    console.error('Failed to get the app by id. Returned error: ' + err);
                });
            }
            else {
                startGame();
            }
        }, function (err) {
            console.error('Failed to get the app by id. Returned error: ' + err);
        });
    }, function (err) {
        console.error('Failed to refresh the host info. Returned error: ' + err);
    });
}

function snackbarLog(givenMessage) {
    console.log('Snackbar Log: ' + givenMessage);
    document.querySelector('#snackbar').MaterialSnackbar.showSnackbar({message: givenMessage, timeout: 2000});
}

window.onload = onWindowLoad;