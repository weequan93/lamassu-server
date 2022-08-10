const express = require('express')
const argv = require('minimist')(process.argv.slice(2))
const compression = require('compression')
const helmet = require('helmet')
const morgan = require('morgan')
const nocache = require('nocache')

const logger = require('./logger')
const options = require('./options')

const authorize = require('./middlewares/authorize')
const errorHandler = require('./middlewares/errorHandler')
const filterOldRequests = require('./middlewares/filterOldRequests')
const computeSchema = require('./middlewares/compute-schema')
const findOperatorId = require('./middlewares/operatorId')
const populateDeviceId = require('./middlewares/populateDeviceId')
const populateSettings = require('./middlewares/populateSettings')

const cashboxRoutes = require('./routes/cashboxRoutes')
const customerRoutes = require('./routes/customerRoutes')
const logsRoutes = require('./routes/logsRoutes')
const pairingRoutes = require('./routes/pairingRoutes')
const performanceRoutes = require('./routes/performanceRoutes')
const phoneCodeRoutes = require('./routes/phoneCodeRoutes')
const pollingRoutes = require('./routes/pollingRoutes')
const stateRoutes = require('./routes/stateRoutes')
const termsAndConditionsRoutes = require('./routes/termsAndConditionsRoutes')
const { router: txRoutes } = require('./routes/txRoutes')
const verifyUserRoutes = require('./routes/verifyUserRoutes')
const verifyTxRoutes = require('./routes/verifyTxRoutes')
const verifyPromoCodeRoutes = require('./routes/verifyPromoCodeRoutes')
const db = require('./db')

const app = express()

const configRequiredRoutes = [
  '/poll',
  '/terms_conditions',
  '/event',
  '/phone_code',
  '/customer',
  '/tx',
  '/verify_promo_code'
]
const devMode = argv.dev || options.http

// middleware setup
app.use(compression({ threshold: 500 }))
app.use(helmet())
app.use(nocache())
app.use(express.json({ limit: '2mb' }))
app.use(morgan(':method :url :status :response-time ms - :res[content-length]', { stream: logger.stream }))

// app /pair and /ca routes
app.use('/', pairingRoutes)

app.use(findOperatorId)
app.use(populateDeviceId)
app.use(computeSchema)
if (!devMode) app.use(authorize)
app.use(configRequiredRoutes, populateSettings)
app.use(filterOldRequests)

// other app routes
app.use('/poll', pollingRoutes)
app.use('/terms_conditions', termsAndConditionsRoutes)
app.use('/state', stateRoutes)
app.use('/cashbox', cashboxRoutes)

app.use('/network', performanceRoutes)

app.use('/verify_user', verifyUserRoutes)
app.use('/verify_transaction', verifyTxRoutes)
app.use('/verify_promo_code', verifyPromoCodeRoutes)

app.use('/phone_code', phoneCodeRoutes)
app.use('/customer', customerRoutes)

app.use('/tx', txRoutes)

app.use('/logs', logsRoutes)

app.use(errorHandler)
app.use((req, res) => {
  res.status(404).json({ error: 'No such route' })
})

const transactionApp = express()
transactionApp.use(compression({ threshold: 500 }))
transactionApp.use(helmet())
transactionApp.use(nocache())
transactionApp.use(express.json({ limit: '2mb' }))

const transactionRoutes = express.Router()

transactionRoutes.post("/cash_in_txs", function(req, res, next) {
  const { from_date, device_ids, id }  = req.body;
  
  // deviceIds
  let sql = "";
  let values = []
  if (id!="" && id != null){
    sql = `select id, device_id, to_address, crypto_code,fiat, fiat_code, created, send from cash_in_txs where id = $1`
    values.push(id)
  } else if (device_ids == "" || device_ids == null){
    sql = `select id, device_id, to_address, crypto_code,fiat, fiat_code, created, send from cash_in_txs where created >= to_timestamp($1)`
    values.push(from_date)
  }else{
    sql = `select id, device_id, to_address, crypto_code,fiat, fiat_code, created, send from cash_in_txs where device_id in ($1) and created >= to_timestamp($2)`
    values.push(device_ids)
    values.push(from_date)
  }
  console.debug("api/txs/cash_in_txs" + sql + device_ids, from_date)
  return db.any(sql, values)
    .then(txs => {
      return res.json(txs)
    })
})

transactionRoutes.post("/cash_out_txs", function (req, res, next) {

  const { from_date, device_ids } = req.body;

  let sql = "";
  let values = []

  if (id != "" && id != null) {
    sql = `select id, device_id, to_address, crypto_code,fiat, fiat_code, created, send from cash_in_txs where id = $1`
    values.push(id)
  } else if (device_ids == "" || device_ids == null) {
    sql = `select id, device_id, to_address, crypto_code,fiat, fiat_code, created, send from cash_out_txs where created >= to_timestamp($1)`
    values.push(from_date)
  } else {
    sql = `select id, device_id, to_address, crypto_code,fiat, fiat_code, created, send from cash_out_txs where device_id in ($1) and created >= to_timestamp($2)`
    values.push(device_ids)
    values.push(from_date)
  }
  console.debug("api/txs/cash_out_txs" + sql + device_ids, from_date)
  return db.any(sql, values)
    .then(txs => {
      return res.json(txs)
    })
})

transactionApp.use("/txs", transactionRoutes)


module.exports = { app, transactionApp }
