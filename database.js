require('dotenv').config()

const knex = require('knex')({
    client: 'pg',
    connection: {
        connectionString: process.env.DATABASE_URL,
        ssl: false
    }
})

module.exports = require('bookshelf')(knex)
