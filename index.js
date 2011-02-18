var Traverse = require('traverse');
var EventEmitter = require('events').EventEmitter;

var exports = module.exports = function (wrapper) {
    var self = {};
    
    self.clients = {};
    
    self.create = function () {
        var id = null;
        do {
            id = Math.floor(
                Math.random() * Math.pow(2,32)
            ).toString(16);
        } while (clients[id]);
        
        var instance = typeof(wrapper) == 'function'
            ? new wrapper(self.remote, self)
            : wrapper
        ;
        
        var client = Session(id);
        clients[id] = client;
        return client;
    };
    
    self.destroy = function (id) {
        delete clients[id];
    };
};

var Session = exports.Session = function () {
    var self = new EventEmitter;
    self.remote = {};
    self.scrubber = new Scrubber;
    
    self.request = function (method, args) {
        var scrub = self.scrubber.scrub(args);
        
        self.emit('request', JSON.stringify({
            method : method,
            arguments : scrub.arguments,
            callbacks : scrub.callbacks,
            links : scrub.links
        }) + '\n');
    };
    
    self.parse = function (line) {
        var msg = null;
        try { msg = JSON.parse(line) }
        catch (err) { self.emit('error', err) }
        
        if (msg) {
            try { self.handle(msg) }
            catch (err) { self.emit('error', err) }
        }
    };
    
    var wrapped = {};
    self.handle = function (req) {
        var args = self.scrubber.unscrub(req, function (id) {
            if (!(id in wrapped)) {
                // create a new function only if one hasn't already been created
                // for a particular id
                wrapped[id] = function () {
                    self.sendRequest(id, [].slice.apply(arguments));
                };
            }
            return wrapped[id];
        });
        
        if (req.method === 'methods') {
            handleMethods(args[0]);
        }
        else if (req.method === 'error') {
            var methods = args[0];
            self.emit('remoteError', methods);
        }
        else if (typeof req.method == 'string') {
            if (self.instance.propertyIsEnumerable(req.method)) {
                apply(self.instance[req.method], self.instance, args);
            }
            else {
                console.warn('Request for non-enumerable method: ' + req.method);
            }
        }
        else if (typeof req.method == 'number') {
            apply(scrubber.callbacks[req.method], self.instance, args);
        }
    }
    
    function handleMethods (methods) {
        if (typeof methods != 'object') {
            methods = {};
        }
        
        // copy since assignment discards the previous refs
        Object.keys(self.remote).forEach(function (key) {
            delete self.remote[key];
        });
        
        Object.keys(methods).forEach(function (key) {
            self.remote[key] = methods[key];
        });
        
        self.emit('remote', self.remote);
        self.emit('ready');
    }
    
    function apply(f, obj, args) {
        try { f.apply(obj, args) }
        catch (err) { self.emit('error', err) }
    }
    
    return self;
};

// scrub callbacks out of requests in order to call them again later
var Scrubber = exports.Scrubber = function () {
    var self = {};
    self.callbacks = {};
    var wrapped = [];
    
    var cbId = 0;
    
    // Take the functions out and note them for future use
    self.scrub = function (obj) {
        var paths = {};
        var links = [];
        
        var args = Traverse(obj).modify(function (node) {
            if (typeof(node) == 'function') {
                var i = wrapped.indexOf(node);
                if (i >= 0 && !(i in paths)) {
                    // Keep previous function IDs only for the first function
                    // found. This is somewhat suboptimal but the alternatives
                    // are worse.
                    paths[i] = this.path;
                }
                else {
                    self.callbacks[cbId] = node;
                    wrapped.push(node);
                    paths[cbId] = this.path;
                    cbId++;
                }
                
                this.update('[Function]');
            }
            else if (this.circular) {
                links.push({ from : this.circular.path, to : this.path });
                this.update('[Circular]');
            }
        }).get();
        
        return {
            arguments : args,
            callbacks : paths,
            links : links
        };
    };
    
    // Replace callbacks. The supplied function should take a callback id and
    // return a callback of its own.
    self.unscrub = function (msg, f) {
        var args = msg.arguments || [];
        Object.keys(msg.callbacks || {}).forEach(function (strId) {
            var id = parseInt(strId,10);
            var path = msg.callbacks[id];
            args = setAt(args, path, f(id));
        });
        
        (msg.links || []).forEach(function (link) {
            var value = getAt(args, link.from);
            args = setAt(args, link.to, value);
        });
        
        return args;
    };
    
    function setAt (ref, path, value) {
        var node = ref;
        path.slice(0,-1).forEach(function (key) {
            node = node[key];
        });
        var last = path.slice(-1)[0];
        if (last === undefined) {
            return value;
        }
        else {
            node[last] = value;
            return ref;
        }
    }
    
    function getAt (node, path) {
        path.forEach(function (key) {
            node = node[key];
        });
        return node;
    }
    
    return self;
}
