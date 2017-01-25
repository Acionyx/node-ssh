/* @flow */

import FS from 'fs'
import Path from 'path'
import mkdirp from 'mkdirp'
import promisify from 'sb-promisify'
import type { ConfigGiven, Config, ConfigDirectoryTransferGiven, ConfigDirectoryTransfer } from './types'

const CODE_REGEXP = /Error: (E[\S]+): /
const readFile = promisify(FS.readFile)
const promisedMkdirp = promisify(mkdirp)
export const stat = promisify(FS.stat)
export const readdir = promisify(FS.readdir)

function transformError(givenError) {
  const code = CODE_REGEXP.exec(givenError)
  if (code) {
    // eslint-disable-next-line no-param-reassign
    givenError.code = code[1]
  }
  return givenError
}

export function exists(filePath: string): Promise<boolean> {
  return new Promise(function(resolve) {
    FS.access(filePath, FS.R_OK, function(error) {
      resolve(!error)
    })
  })
}

export function mkdirSftp(path: string, sftp: Object): Promise<void> {
  return promisedMkdirp(path, {
    fs: {
      mkdir(dirPath, _, cb) {
        sftp.mkdir(dirPath, function(givenError) {
          cb(givenError ? transformError(givenError) : null)
        })
      },
      stat(dirPath, cb) {
        sftp.stat(dirPath, cb)
      },
    },
  })
}

export async function normalizeConfig(givenConfig: ConfigGiven): Promise<Config> {
  const config: Object = Object.assign({}, givenConfig)
  if (config.username && typeof config.username !== 'string') {
    throw new Error('config.username must be a valid string')
  }
  if (typeof config.host !== 'string' || !config.host) {
    throw new Error('config.host must be a valid string')
  }
  if (config.privateKey) {
    const privateKey = config.privateKey
    if (typeof privateKey !== 'string') {
      throw new Error('config.privateKey must be a string')
    }
    if (!(privateKey.includes('BEGIN') && privateKey.includes('KEY'))) {
      try {
        config.privateKey = await readFile(privateKey, 'utf8')
      } catch (error) {
        if (error.code === 'ENOENT') {
          throw new Error(`config.privateKey does not exist at ${privateKey}`)
        }
        throw error
      }
    }
  } else if (config.password) {
    const password = config.password
    if (typeof password !== 'string') {
      throw new Error('config.password must be a string')
    }
  }
  return config
}

export function normalizePutDirectoryConfig(givenConfig: ConfigDirectoryTransferGiven): ConfigDirectoryTransfer {
  const config: Object = Object.assign({}, givenConfig)
  if (config.tick) {
    if (typeof config.tick !== 'function') {
      throw new Error('config.tick must be a function')
    }
  } else {
    config.tick = function() { }
  }
  if (config.validate) {
    if (typeof config.validate !== 'function') {
      throw new Error('config.validate must be a function')
    }
  } else {
    config.validate = function(path) {
      return Path.basename(path).substr(0, 1) !== '.'
    }
  }
  config.recursive = {}.hasOwnProperty.call(config, 'recursive') ? !!config.recursive : true
  return config
}

export function generateCallback(resolve: Function, reject: Function): Function {
  return function(error, result) {
    if (error) {
      reject(error)
    } else {
      resolve(result)
    }
  }
}
