const createError = require('http-errors')
const express = require('express')
const path = require('path')
const cookieParser = require('cookie-parser')
const logger = require('morgan')

const indexRouter = require('./routes/index')
const usersRouter = require('./routes/users')

const app = express()

require('dotenv').config()

// Upload all new files to S3 every minute
if (process.env.ENVIRONMENT === 'antenna') {
  const cron = require('node-cron')
  const AWS = require('aws-sdk')
  const fs = require('fs')
  const s3 = new AWS.S3()
  const mmm = require('mmmagic');
  const Magic = mmm.Magic

  const Entry = require('./models/entry')

  const wsPolyfill = require('websocket-polyfill')
  const nostr = require('nostr-tools')
  nostr.useFetchImplementation(require('node-fetch'))

  cron.schedule('* * * * *', async () => {
    try {
      const damus = nostr.relayInit('wss://relay.damus.io')
      const rsslay = nostr.relayInit('wss://rsslay.fiatjaf.com')
      const bitcoinerSocial = nostr.relayInit('wss://nostr.bitcoiner.social')
    
      damus.on('connect', () => {
        console.log(`Connected to ${damus.url}`)
      })
      rsslay.on('connect', () => {
        console.log(`Connected to ${damus.url}`)
      })
      bitcoinerSocial.on('connect', () => {
        console.log(`Connected to ${damus.url}`)
      })
      // console.log('Running cronjob...')
      // Check for latest file on S3
      let today = new Date()
      const days = 86400000
      const monthago = new Date(today - (30*days))
      s3.listObjectsV2({ Bucket: process.env.S3_BUCKET_NAME, Prefix: 'downloads/', StartAfter: `downloads/${monthago.toISOString().slice(0,10).replaceAll('-', '')}000000` }, (err, data) => {
        if (err) {
          console.error(err)
          return
        }
        // Order from newest to oldest and find newest one
        let s3files = data.Contents
        s3files.sort((a, b) => parseInt(b.Key.split('/')[1]) - parseInt(a.Key.split('/')[1]))
        let latestS3 = 0
        if (s3files.length > 1) {
          latestS3 = s3files[1].Key.split('/')[1] //Index 0 is the downloads/ folder itself
        }
        // console.log(`Latest file is ${latestS3}`)
  
        // Check if there exist filenames newer than latestS3 on local folder
        let fileList = fs.readdirSync(process.env.BLOCKSAT_DIR)
        let updateList = fileList.filter(name => parseInt(name) - parseInt(latestS3) > 0)
        if (updateList.length === 0) {
          // console.log('No updates to be made')
          return
        }
        console.log('Files not yet synced: ' + updateList)
  
        // If so, upload to S3 with proper MIME type
        let magic = new Magic(mmm.MAGIC_MIME_TYPE)
        for (const file of updateList) {
          magic.detectFile(process.env.BLOCKSAT_DIR + '/' + file, (err, result) => {
            console.log(`Detected file of MIME type ${result}, uploading...`)
            s3.putObject({
              Bucket: process.env.S3_BUCKET_NAME,
              Body: fs.readFileSync(process.env.BLOCKSAT_DIR + '/' + file),
              ContentType: result,
              Key: 'downloads/' + file
            }, (err, data) => {
              if (err) {
                console.error(err)
                return
              }
              // Upload was successful, so let's also add the file to the database
              // This is where Nostr relays should be notified too
              let values = ''
              if (result === 'image/jpeg' || result === 'image/gif' || result === 'image/png' || result === 'image/jpg') {
                new Entry(
                  { type: result, name: file, url: `https://${process.env.S3_BUCKET_NAME}.s3.amazonaws.com/downloads/${file}`, text: ''})
                  .save({}, { method: 'insert', require: true })
                  .then(model => {
                    console.log(`File ${file} added to database`)
                  })
                  .catch(err => {
                    console.error(err)
                  })
                
                let event = signEvent(`New image received on Blocksat: https://${process.env.S3_BUCKET_NAME}.s3.amazonaws.com/downloads/${file}`)
                damus.publish(event)
                rsslay.publish(event)
                bitcoinerSocial.publish(event)
                
              } else if (result === 'text/plain' || result === 'text/html' || result === 'application/pgp') {
                new Entry({ type: result, name: file, url: '', text: fs.readFileSync(process.env.BLOCKSAT_DIR + '/' + file)})
                  .save({}, { method: 'insert', require: true })
                  .then(model => {
                    console.log(`File ${file} added to database`)
                  })
                  .catch(err => {
                    console.error(err)
                  })

                let event = signEvent(`Overheard on Blocksat: ${fs.readFileSync(process.env.BLOCKSAT_DIR + '/' + file)}`)
                damus.publish(event)
                rsslay.publish(event)
                bitcoinerSocial.publish(event)
              }
              console.log(data)
            })
          })
        }
      })
    } catch (err) {
      console.error(err)
    }
  })
}

async function signEvent(content) {
  try {
    let event = {
        kind: 1,
        pubkey: nostr.getPublicKey(process.env.NOSTR_PRIVKEY),
        created_at: Math.floor(Date.now() / 1000),
        tags: [],
        content
      }
    event.id = nostr.getEventHash(event.id)
    event.sig = await nostr.signEvent(event, process.env.NOSTR_PRIVKEY)
    return event
  } catch (err) {
    console.error(err)
  }
}

// view engine setup
app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'ejs')

app.use(logger('dev'))
app.use(express.json())
app.use(express.urlencoded({ extended: false }))
app.use(cookieParser())
app.use(express.static(path.join(__dirname, 'public')))

app.use('/', indexRouter)
app.use('/users', usersRouter)

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404))
})

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message
  res.locals.error = req.app.get('env') === 'development' ? err : {}

  // render the error page
  res.status(err.status || 500)
  res.render('error')
})

module.exports = app
