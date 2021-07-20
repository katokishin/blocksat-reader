const express = require('express');
const router = express.Router();
require('dotenv').config()
const Entry = require('../models/entry')

/* GET home page. */
router.get('/', async (req, res, next) => {
  try {
    // Get list of 30 recent entries
    new Entry().orderBy('name', 'DESC').fetchPage({page:1, pageSize:30})
      .then(entries => {
        console.log(entries.serialize())
        res.render('index', { title: 'Blocksat reader', fileList: entries.serialize() });
      })
      .catch(err => {
        console.error(err)
      })
  } catch (err) {
    console.error(err)
  }
});


module.exports = router
