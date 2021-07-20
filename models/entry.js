const db = require('../database')

const Entry = db.Model.extend({
    tableName: 'entries',
    idAttribute: 'name'
})

module.exports = db.model('Entry', Entry)