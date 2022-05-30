const fs = require('fs')
const pify = require('pify')
const readFile = pify(fs.readFile)
const crypto = require('crypto')
const baseX = require('base-x')

const options = require('../options')
const db = require('../db')
const pairing = require('../pairing')

const ALPHA_BASE = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:'
const bsAlpha = baseX(ALPHA_BASE)

const unpair = pairing.unpair

function totem (hostname, name) {
  const caPath = options.caPath

  return readFile(caPath)
    .then(data => {
      const caHash = crypto.createHash('sha256').update(data).digest()
      const token = crypto.randomBytes(32)
      const hexToken = token.toString('hex')
      const caHexToken = crypto.createHash('sha256').update(hexToken).digest('hex')

      // hostname
      const bufferHostname = Buffer.from(hostname)
      const hostnameSize = Buffer.alloc(4)
      hostnameSize.write(bufferHostname.length.toString(), "utf-8")
      // atmhostname
      const bufferAtmHostname = Buffer.from(options.atmhostname)
      const atmHostnameSize = Buffer.alloc(4)
      atmHostnameSize.write(bufferAtmHostname.length.toString(), "utf-8")
      //32, 32,4,n,4,n
      const buf = Buffer.concat([caHash, token, hostnameSize, bufferHostname, atmHostnameSize, bufferAtmHostname])

      // const buf = Buffer.concat([caHash, token, Buffer.from(hostname)])
      const sql = 'insert into pairing_tokens (token, name) values ($1, $3), ($2, $3)'

      return db.none(sql, [hexToken, caHexToken, name])
        .then(() => bsAlpha.encode(buf))
    })
}

module.exports = {totem, unpair}
