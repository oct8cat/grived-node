'use strict';

var grived = require('../lib/grived'),
    next = function(err) { if (err) { console.error(err); process.exit(0); return } }

grived.ensureRefreshToken(function(err, refreshToken) {
    if (err) { next(err); return }

    grived.getAccessToken(refreshToken, function(err, accessToken) {
        if (err) { next(err); return }

        grived.checkAccess(accessToken, function(err, res) {
            if (err) { next(err); return }

            console.log('API is accessible (' + res.items.length + ' items in your Drive).')

            // Start FS watcher, token refresh cycle, hurr and durr.

            process.exit(0)
        })
    })
})
