var assert = require('assert');
var Scrubber = require('dnode-protocol').Scrubber;

exports.noFuncs = function () {
    var s = new Scrubber;
    assert.eql(
        s.scrub([ 1, 2, 3 ]),
        {
            arguments : [ 1, 2, 3 ],
            callbacks : [],
            links : [],
        }
    );
};
