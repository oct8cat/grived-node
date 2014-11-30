'use strict';

// TODO: Unify access/refresh token requests.
// TODO: Non-UNIX RC file path.

var fs = require('fs'),
    j = require('path').join,
    readline = require('readline'),
    https = require('https'),
    drive = require('googleapis').drive('v2'),
    rssi = require('rssi'),
    chokidar = require('chokidar'),
    _ = require('underscore')

var RC = j(process.env.HOME, '.grivedrc'),
    CLIENT_ID = '591794944756-1gkbbl2u22nroj2tbvqu9pqboeq6qp1g.apps.googleusercontent.com',
    CLIENT_SECRET = 'tatwRgAf0WoIXUq2I9ZBaPRW',
    REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob',
    MIME_FOLDER = 'application/vnd.google-apps.folder',
    CODE_URI = rssi('https://accounts.google.com/o/oauth2/auth?' +
            'scope=https://www.googleapis.com/auth/drive&' +
            'redirect_uri=#{redirectUri}&' +
            'response_type=code&' +
            'client_id=#{clientId}')({redirectUri: REDIRECT_URI, clientId: CLIENT_ID})

var ACCESS_TOKEN

/**
 * @constructor
 * @global
 * @alias Grived
 */
function Grived() {}

/**
 * Ensures that RC file contains refresh token. Passes the token to the callback
 * as a second argument.
 * @param {callbacks~ErrorStringCallback} cb Callback.
 */
Grived.prototype.ensureRefreshToken = function(cb) {
    var that = this,
        next = function(err) {
            if (err) { cb(err); return }

            fs.readFile(RC, function(err, data) {
                try {
                    cb(err, JSON.parse(data).refreshToken)
                } catch (err) { cb(err) }
            })
        }

    if (!fs.existsSync(RC)) {
        that.getCode(function(err, code) {
            if (err) { cb(err); return }
            if (!code || typeof code !== 'string') { cb('Invalid code'); return }

            that.getRefreshToken(code, function(err, refreshToken) {
                if (err) { cb(err); return }
                if (!refreshToken || typeof refreshToken !== 'string') { cb('Invalid refresh token'); return }

                that.saveRefreshToken(refreshToken, next)
            })
        })
    } else {
        next()
    }
}

/**
 * Reads auth code from STDIN.
 * @param {callbacks~ErrorStringCallback} cb Callback.
 */
Grived.prototype.getCode = function(cb) {
    var rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    })
    rl.question('Paste your code from ' + CODE_URI + ' here: ', function(code) {
        rl.close()
        cb(null, code)
    })
}

/**
 * Retrieves refresh token by auth code.
 * @param {callbacks~ErrorStringCallback} cb Callback.
 */
Grived.prototype.getRefreshToken = function(code, cb) {
    var json = {
        code: code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code'
    }

    var data = Object.keys(json).map(function(key) { return key + '=' + json[key] }).join('&')

    var req = https.request({
        host: 'accounts.google.com',
        path: '/o/oauth2/token',
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': data.length
        }
    }, function(res) {
        var body = ''
        res.on('data', function(data) { body += data }).on('end', function() {
            try {
                var json = JSON.parse(body)
                if (json.error) { cb(json); return }
                cb(null, json.refresh_token)
            } catch (err) { cb(err) }
        })
    })

    req.write(data)
    req.end()
}

/**
 * Writes the given refresh token to RC file.
 * @param {string} refreshToken Refresh token.
 * @param {callbacks~ErrorCallback} cb Callback.
 */
Grived.prototype.saveRefreshToken = function(refreshToken, cb) {
    fs.writeFile(RC, JSON.stringify({refreshToken: refreshToken}), cb)
}

/**
 * Retrieves new access token by the given refresh token.
 * @param {string} refreshToken Refresh token.
 * @param {callbacks~ErrorStringCallback} cb Callback.
 */
Grived.prototype.getAccessToken = function(refreshToken, cb) {
    var json = {
        refresh_token: refreshToken,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        grant_type: 'refresh_token'
    }

    var data = Object.keys(json).map(function(key) { return key + '=' + json[key] }).join('&')

    var req = https.request({
        host: 'accounts.google.com',
        path: '/o/oauth2/token',
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': data.length
        }
    }, function(res) {
        var body = ''
        res.on('data', function(data) { body += data }).on('end', function() {
            try {
                var json = JSON.parse(body)
                cb(null, json.access_token)
            } catch (err) { cb(err) }
        })
    })

    req.write(data)
    req.end()
}

/**
 * Checks if Google Drive API is accessible with current access token.
 * @param {callbacks~ErrorObjectCallback} cb Callback.
 */
Grived.prototype.checkAccess = function(cb) {
    drive.files.list({access_token: ACCESS_TOKEN, maxResults: 0}, cb)
}

Grived.prototype.setAccessToken = function(value) {
    ACCESS_TOKEN = value
    return this
}

Grived.prototype.tree = function(cb) {
    var that = this,
        fields = 'id, title, mimeType, parents'
    that.list({fields: 'items(' + fields + ')', maxResults: 0}, function(err, res) {
        if (err) { cb(err); return }
        var items = res.items
        that.get({fileId: 'root', fields: fields}, function(err, res) {
            if (err) { cb(err); return }
            var root = res

            function sync(node) {
                if (node.mimeType !== MIME_FOLDER) { return }
                if (!node.children) { node.children = [] }
                _.each(items, function(item) {
                    if (!_.findWhere(item.parents || [], {id: node.id})) { return }
                    node.children.push(item)
                    sync(item)
                })
            }

            sync(root)
            require('fs').writeFile('/tmp/grived.json', JSON.stringify(root, null, 4), cb)
        })
    })
}

_.each(['list', 'get'], function(method) {
    Grived.prototype[method] = function(params, cb) {
        if (typeof params === 'function') { cb = params; params = {} }
        params.access_token = ACCESS_TOKEN
        drive.files[method](params, cb)
    }
})

module.exports = new Grived()
