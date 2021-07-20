# blocksat reader

A quick and dirty web app that lets people view the latest 30 messages received via Blockstream Satellite API.

## Deployment on antenna machine

When running on the same network as a SAT-IP antenna listening to the Blockstream Satellite, this Express app
will upload text and image files to AWS S3, as well as update a Postgres database containing text and URL info
for use by this Express app when run on Heroku.

`git clone` this repository
create and edit `.env` file (use `.env.example` as template)
`npm install`
make sure `blocksat-cli sat-ip -a local.ip.of.antenna` and `blocksat-cli api listen --save-raw --plaintext --echo` are running
`npm start`

Keep this program running, otherwise you will not get updates!

## Deployment to Heroku

Create a Heroku app, fork this repository, and set it as the code for the Heroku app.

Make sure to set environment variables as outlined in `.env` from the Dashboard.

People will access the Heroku app to see the latest messages broadcast over Blocksat.

## Using AWS S3 to store files

We use AWS S3 to store files, particularly image files, in a way that they can be easily and cheaply served.

There are other ways, but this was simplest, and probably most robust.