var assert = require('assert');
var proto = require('dnode-protocol');

exports.protoHashes = function () {
    var client = proto({
        a : function (cb) { cb(1, 2, 3) },
        b : function (n, cb) { cb(n * 10) },
        c : 444,
    });
    
    var server = proto({
        x : function (f, g) {
            setTimeout(f.bind({}, 7, 8, 9), 50);
            setTimeout(g.bind({}, [ 'q', 'r' ]), 100);
        },
        y : 555,
    });
    
    var s = server.create();
    assert.ok(s.id);
    
    var to = setTimeout(function () {
        assert.fail('not enough responses');
    }, 1000);
    
    var reqs = [];
    s.on('request', function (req) {
        reqs.push(req);
        
        if (reqs.length === 1) {
            clearTimeout(to);
            assert.eql(reqs, [
                {
                    method : 'methods',
                    arguments : [ { x : '[Function]', y : 555 } ],
                    callbacks : { 0 : [ '0', 'x' ] },
                    links : [],
                }
            ]);
        }
    });
    
    s.start();
};
