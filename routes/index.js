const express = require('express');
const router = express.Router();
require('dotenv').config()
const Entry = require('../models/entry')

const RSS = require('rss');

/* GET home page. */
router.get('/', (req, res, next) => {
  // Get list of 30 recent entries
  new Entry().orderBy('name', 'DESC').fetchPage({ page: 1, pageSize: 30 })
    .then(entries => {
      res.render('index', { title: 'Blocksat reader', fileList: entries.serialize() });
    })
    .catch(next);
});

/* GET RSS feed - NOTE: configured here solely for blocksat-reader.herokuapp.com */
router.get('/rss.xml', (req, res, next) => {
  // TODO: implement caching
  // Create feed
  const feed = new RSS({
    title: 'Latest Blockstream Satellite transmissions',
    description: 'The 30 latest transmissions received via Blocksat',
    feed_url: 'https://blocksat-reader.herokuapp.com/rss.xml',
    site_url: 'https://blocksat-reader.herokuapp.com',
    webMaster: 'kishin@trustless-services.com (Kishin Kato)'
  });

  // Get list of 30 recent entries & add them to feed
  new Entry().orderBy('name', 'DESC').fetchPage({ page: 1, pageSize: 30 })
    .then(entries => {
      entries.serialize().forEach(entry => {
        feed.item({
          title: `${entry.text.substring(0, 30)}... [${entry.type}]`,
          description: `${entry.text} ${entry.url ? `<img src="${entry.url}">` : ''}`,
          date: nameToDate(entry.name),
          guid: entry.name
        });
      });
      res.type('application/xml');
      res.send(feed.xml({ indent: true }));
    })
    .catch(next);
});

/* Helper: entry name to Date */
const nameToDate = name => {
  return new Date(name.substring(0, 4) + '-' + name.substring(4, 6) + '-' + name.substring(6, 8) + ' '
    + name.substring(8, 10) + ':' + name.substring(10, 12) + ':' + name.substring(12, 14)
    + ' +0900');
};

module.exports = router
