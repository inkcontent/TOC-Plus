/**
 * INKAPI runtime library
 */
const IS_WORKER = typeof importScripts === 'function';
const CALL_EXEC_TIME = 10 * 1000; //30s


let counter = 0;
const pendingCalls = {};
const registeredCallbacks = {};

let _ready = false;


//Generate a plugin unique ID
let UID;



/**
 * INKApi fields are dynamically generated
 */
const INKAPI = {
    ready: waitReady
};

const messageHandler = {
    contract: contractHandler,
    "handshake-resp": contractHandler,
    "call-resp": resultHandler,
    callback: callbackHandler,
    identify: identifyHandler
}

//Are we running in a worker context ?
if (IS_WORKER) {

    onmessage = function (e) {

        const data = e.data;
        if (!data || !data.cmd) return;
        const handler = messageHandler[data.cmd];
        if (handler) handler.call(null, data);
    }
}
function identifyHandler(data) {
    UID = data.uid;
    INKAPI.__identity__ = { UID, script: data.script };
    postMessage({ cmd: 'handshake', id: UID });
}
function contractHandler(data) {
    if (!data || !data.contract) return;

    const contract = data.contract;
    parseContract(contract);

    for (let p in contract) //update the API
        INKAPI[p] = contract[p];

    _ready = true;
}

function resultHandler(data) {
    if (pendingCalls[data.id]) {
        const promise = pendingCalls[data.id];
        if (typeof data.error === 'undefined') {
            promise.resolve(data.result);
        }
        else
            promise.reject({ error: data.error });

        delete pendingCalls[data.id];
    }
}

function callbackHandler(data) {
    registeredCallbacks[data.id].apply(null, data.args);
}



function createProxyFunction(callName) {
    const proxy = (...args) => {
        const id = UID + ':' + (++counter) + '-' + Date.now();
        let callObj = {};
        const promise = new Promise((resolve, reject) => {
            callObj.resolve = resolve;
            /*async (r) => {
                await waitReady(10 * 1000);
                resolve(r);
            }*/
            callObj.reject = reject;
        });
        pendingCalls[id] = callObj;

        let argPos = 0;
        //if a function is passed as an argument, keep it in registeredCallbacks table and pass its id to RPC arguments
        const _arguments = args.map(arg => {
            if (typeof arg === 'function') {
                const argId = UID + ':#CB#' + argPos + ':' + (++counter);
                argPos++;
                registeredCallbacks[argId] = arg;
                return argId;
            }

            return arg;
        })
        postMessage({ cmd: 'call', call: callName, args: _arguments, id })

        //handles pending calls expiration
        //this will keep pendingCalls structure clean, and avoid overloading plugins api with unresponsive calls
        expireCall(id, CALL_EXEC_TIME);

        return promise;
    }

    return proxy;
}

function parseContract(node, parent = '') {
    for (let p in node) {
        if (node[p] === 'function') {
            node[p] = createProxyFunction(parent + p);
        }
        else {
            parseContract(node[p], parent + p + '.');
        }
    }
}

function expireCall(id, time) {
    setTimeout(() => {
        if (!pendingCalls[id]) return;
        pendingCalls[id].reject({ error: 'Call timeout' });
        delete pendingCalls[id];
    }, time);
}

function waitReadyCB(maxwait = 10 * 1000, resolve, reject) {
    if (_ready) resolve(true);
    const tout = setTimeout(() => {
        clearInterval(itv);
        reject({ error: 'Plugins API load timeout' })
    }, maxwait);
    const itv = setInterval(() => {
        if (_ready) {
            clearTimeout(tout);
            clearInterval(itv);
            resolve(true);
        }
    }, 30);
}


function waitReady(resolve, reject) {
    if (resolve) return waitReadyCB(10 * 1000, resolve, reject);
    else
        return new Promise((resolve, reject) => waitReadyCB(10 * 1000, resolve, reject))
}