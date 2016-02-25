var callbacks = {}
var callbacks_ids = 1;

var sendMessage = function(method, params) {
    return new Promise(function(resolve, reject) {
        var id = callbacks_ids++;
        callbacks[id] = {'resolve': resolve, 'reject': reject};
        
        common.naclModule.postMessage({
            'callbackId': id,
            'method': method,
            'params': params
        });
    });
}

function handleMessage(msg) {
    if (msg.data.callbackId && callbacks[msg.data.callbackId]) {
        callbacks[msg.data.callbackId][msg.data.type](msg.data.ret);
        delete callbacks[msg.data.callbackId]
    } else {
        console.log(msg.data);
    }
}