require('dotenv').config()

const knex = require('knex')({
    client: 'pg',
    connection: {
        connectionString: process.env.DATABASE,
        ssl: { rejectUnauthorized: false }
    }
})

module.exports = require('bookshelf')(knex)