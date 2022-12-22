const createError = require('http-errors')
const express = require('express')
const path = require('path')
const cookieParser = require('cookie-parser')
const logger = require('morgan')

const { WebSocket } = require('websocket-polyfill')
const fetch = require('node-fetch')
if (!globalThis.fetch) {
  globalThis.fetch = fetch
}
if (!globalThis.WebSocket) {
  globalThis.WebSocket = WebSocket
}
const nostr = require('nostr-tools')

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

  cron.schedule('* * * * *', async () => {
    try {
      const damus = nostr.relayInit('wss://relay.damus.io')
      const bitcoinerSocial = nostr.relayInit('wss://nostr.bitcoiner.social')
      
      damus.connect()
      damus.on('connect', () => {
        console.log(`Connected to ${damus.url}`)
      })
      damus.on('error', () => {
        console.log(`Failed to connect to ${damus.url}`)
      })
      bitcoinerSocial.connect()
      bitcoinerSocial.on('connect', () => {
        console.log(`Connected to ${bitcoinerSocial.url}`)
      })
      bitcoinerSocial.on('error', () => {
        console.log(`Failed to connect to ${bitcoinerSocial.url}`)
      })
      // console.log('Running cronjob...')
      // Check for latest file on S3
      let today = new Date()
      const days = 86400000
      const monthago = new Date(today - (30*days))
      let data = await s3.listObjectsV2({ Bucket: process.env.S3_BUCKET_NAME, Prefix: 'downloads/', StartAfter: `downloads/${monthago.toISOString().slice(0,10).replaceAll('-', '')}000000` }).promise()
      
      // Order from newest to oldest and find newest one
      let s3files = data.Contents
      s3files.sort((a, b) => parseInt(b.Key.split('/')[1]) - parseInt(a.Key.split('/')[1]))
      let latestS3 = 0
      if (s3files.length > 1) {
        latestS3 = s3files[0].Key.split('/')[1] //Index 0 is the downloads/ folder itself
      }
      // console.log(`Latest file on S3 is ${latestS3}`)
      // console.log(`parseInt(latestS3): ${parseInt(latestS3)}`)
      // Check if there exist filenames newer than latestS3 on local folder
      let fileList = fs.readdirSync(process.env.BLOCKSAT_DIR)
      let updateList = fileList.filter(name => {
        if (parseInt(name) > parseInt(latestS3)) {
          console.log(`parseInt(name): ${parseInt(name)} is greater than ${parseInt(latestS3)}`)
          return true
        } else { return false }
      })
      if (updateList.length === 0) {
        console.log('No updates to be made')
        return
      }
      console.log('Files not yet synced: ' + updateList)
  
      // If so, upload to S3 with proper MIME type
      function wrappedMagicDetect(pathToFile) {
        return new Promise((resolve, reject) => {
          let magic = new Magic(mmm.MAGIC_MIME_TYPE)
          magic.detectFile(pathToFile, (err, result) => {
            if (err) {
              reject(err)
              return
            }
            resolve(result)
          })
        })
      }
      for (const file of updateList) {
        let mimeType = await wrappedMagicDetect(process.env.BLOCKSAT_DIR + '/' + file)
        console.log(`Detected file of MIME type ${mimeType}, uploading...`)
        let upload = await s3.putObject({
          Bucket: process.env.S3_BUCKET_NAME,
          Body: fs.readFileSync(process.env.BLOCKSAT_DIR + '/' + file),
          ContentType: mimeType,
          Key: 'downloads/' + file
        }).promise()
        // Upload was successful, so let's also add the file to the database
        // This is where Nostr relays should be notified too
        let values = ''
        if (mimeType === 'image/jpeg' || mimeType === 'image/gif' || mimeType === 'image/png' || mimeType === 'image/jpg') {
          new Entry(
            { type: mimeType, name: file, url: `https://${process.env.S3_BUCKET_NAME}.s3.amazonaws.com/downloads/${file}`, text: ''})
            .save({}, { method: 'insert', require: true })
            .then(model => {
              console.log(`File ${file} added to database`)
            })
            .catch(err => {
              console.error(err)
            })
              
          let event = await signEvent(JSON.stringify({
            type: mimeType, name: file, url: `https://${process.env.S3_BUCKET_NAME}.s3.amazonaws.com/downloads/${file}`, text: ''
          }))
          damus.publish(event)
          bitcoinerSocial.publish(event)
          damus.on('ok', () => 'damus success')
          damus.on('failed', () => { console.error('Failed to post to damus') })
          bitcoinerSocial.on('ok', () => 'bitcoinerSocial success')
          bitcoinerSocial.on('failed', () => { console.error('Failed to post to bitcoinerSocial') })
                
        } else if (mimeType === 'text/plain' || mimeType === 'text/html' || mimeType === 'application/pgp') {
          new Entry({ type: mimeType, name: file, url: '', text: fs.readFileSync(process.env.BLOCKSAT_DIR + '/' + file)})
            .save({}, { method: 'insert', require: true })
            .then(model => {
              console.log(`File ${file} added to database`)
            })
            .catch(err => {
              console.error(err)
            })

          let event = await signEvent(JSON.stringify({
            type: mimeType, name: file, url: '', text: fs.readFileSync(process.env.BLOCKSAT_DIR + '/' + file)
          }))
          damus.publish(event)
          bitcoinerSocial.publish(event)
          damus.on('ok', () => 'damus success')
          damus.on('failed', () => { console.error('Failed to post to damus') })
          bitcoinerSocial.on('ok', () => 'bitcoinerSocial success')
          bitcoinerSocial.on('failed', () => { console.error('Failed to post to bitcoinerSocial') })
        }
        console.log(upload)
      }
      await damus.close()
      await bitcoinerSocial.close()
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
    event.id = nostr.getEventHash(event)
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
