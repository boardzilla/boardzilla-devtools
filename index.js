var anyPrebuilt = require('any-prebuilt')
anyPrebuilt.initialize(__dirname, require('./package.json').prebuilt)
module.exports.path = anyPrebuilt.path
