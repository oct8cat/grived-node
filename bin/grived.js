'use strict';

var grived = require('../lib/grived'),
    next = function(err) { if (err) { console.error(err); process.exit(0); return } },
    j = require('path').join,
    DIR = j(__dirname, '..', 'drive')

grived.ensureRefreshToken(function(err, refreshToken) {
    if (err) { next(err); return }

    grived.getAccessToken(refreshToken, function(err, accessToken) {
        if (err) { next(err); return }

        grived.setAccessToken(accessToken).tree(next)
    })
})
