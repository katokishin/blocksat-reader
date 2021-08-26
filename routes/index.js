const express = require('express');
const router = express.Router();
require('dotenv').config()
const Entry = require('../models/entry')

let RSS = require('rss');
const entry = require('../models/entry');

/* GET home page. */
router.get('/', async (req, res, next) => {
  try {
    // Get list of 30 recent entries
    new Entry().orderBy('name', 'DESC').fetchPage({page:1, pageSize:30})
      .then(entries => {
        // console.log(entries.serialize())
        res.render('index', { title: 'Blocksat reader', fileList: entries.serialize() });
      })
      .catch(err => {
        console.error(err)
      })
  } catch (err) {
    console.error(err)
  }
});

/* GET RSS feed - NOTE: configured here solely for blocksat-reader.herokuapp.com */
router.get('/rss.xml', async (req, res, next) => {
  try {
    // TODO: implement caching
    // Create feed
    let feed = new RSS({
      title: 'Latest Blockstream Satellite transmissions',
      descriptions: 'The 30 latest transmissions received via Blocksat',
      feed_url: 'https://blocksat-reader.herokuapp.com/rss.xml',
      site_url: 'https://blocksat-reader.herokuapp.com',
      webMaster: 'kishin@trustless-services.com (Kishin Kato)'
    })

    // Get list of 30 recent entries & add them to feed
    new Entry().orderBy('name', 'DESC').fetchPage({page:1, pageSize:30})
      .then(entries => {
        // console.log(entries.serialize())
        entries.serialize().forEach(entry => {
          feed.item({
            title: `${entry.name}, type: ${entry.type}`,
            description: `${entry.text} ${entry.url ? `<img src="${entry.url}">` : ''}`,
            date: nameToDate(entry.name)
          })
        })
        res.type('application/xml')
        res.send(feed.xml({ indent: true }))
      })
      .catch(err => {
        console.error(err)
      })
  } catch (err) {
    console.error(err)
  }
})

/* Helper: entry name to Date */
const nameToDate = name => {
  return new Date(name.substring(0,4) + '-' + name.substring(4,6) + '-' + name.substring(6,8) + ' '
          + name.substring(8,10) + ':' + name.substring(10,12) + ':' + name.substring(12,14)
          + ' +0900')
}

/* Helper: escape HTML text in RSS description. Unused for now, as node-rss uses CDATA tag */
const escapeHtml = string => {
  return string.replace(
    /[^0-9A-Za-z ]/g,
    c => "&#" + c.charCodeAt(0) + ";"
  )
}

module.exports = router
