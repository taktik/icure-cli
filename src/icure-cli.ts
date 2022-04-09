import 'isomorphic-fetch'
import {
  Api,
  hex2ua,
  IccAccesslogXApi,
  IccAgendaApi,
  IccAuthApi,
  IccCalendarItemXApi,
  IccClassificationXApi,
  IccCodeXApi,
  IccContactXApi,
  IccCryptoXApi,
  IccDocumentXApi,
  IccEntityrefApi,
  IccFormXApi,
  IccGroupApi,
  IccHcpartyXApi,
  IccHelementXApi,
  IccInsuranceApi,
  IccInvoiceXApi,
  IccMessageXApi,
  IccPatientXApi,
  IccReceiptXApi,
  IccTimeTableXApi,
  IccUserXApi,
} from '@icure/api'
import { webcrypto } from 'crypto'

import Vorpal, { Args, CommandInstance } from 'vorpal'

import { cmdSearchPatient } from './cmd-search-patient.js'
import { cmdCheckDelegationsConsistency } from './cmd-check-delegations-consistency.js'
import { cmdShare } from './cmd-share.js'
import { cmdShareAll } from './cmd-share-all.js'
import { cmdShamir } from './cmd-shamir.js'
import { cmdCheckHcpKey } from './cmd-check-hcp-key.js'
import { cmdObjectConsistency } from './cmd-object-consistency.js'
import { cmdListPrivateKeys } from './cmd-list-private-keys.js'
import { cmdUserHcp } from './cmd-user-hcp.js'
import { IccDeviceApi } from '@icure/api/icc-api/api/IccDeviceApi'

const vorpal = new Vorpal()

import { LocalStorage } from 'node-localstorage'
import * as os from 'os'
const tmp = os.tmpdir()
console.log('Saving keys in ' + tmp)
;(global as any).localStorage = new LocalStorage(tmp, 5 * 1024 * 1024 * 1024)
;(global as any).Storage = ''

const options = {
  username: undefined as string | undefined,
  password: undefined as string | undefined,
  host: 'https://kraken.icure.dev/rest/v2',
}

let api:
  | {
      cryptoApi: IccCryptoXApi
      authApi: IccAuthApi
      codeApi: IccCodeXApi
      userApi: IccUserXApi
      patientApi: IccPatientXApi
      healthcarePartyApi: IccHcpartyXApi
      deviceApi: IccDeviceApi
      accessLogApi: IccAccesslogXApi
      contactApi: IccContactXApi
      healthcareElementApi: IccHelementXApi
      documentApi: IccDocumentXApi
      formApi: IccFormXApi
      invoiceApi: IccInvoiceXApi
      insuranceApi: IccInsuranceApi
      messageApi: IccMessageXApi
      entityReferenceApi: IccEntityrefApi
      receiptApi: IccReceiptXApi
      agendaApi: IccAgendaApi
      calendarItemApi: IccCalendarItemXApi
      classificationApi: IccClassificationXApi
      timetableApi: IccTimeTableXApi
      groupApi: IccGroupApi
    }
  | undefined

vorpal
  .command('login <username> <password> [host]', 'Login to iCure')
  .action(async function (this: CommandInstance, args: Args) {
    if (!args.username) {
      this.log('Missing username')
      return
    }
    if (!args.password) {
      this.log('Missing username')
      return
    }
    options.username = args.username
    options.password = args.password
    args.host && (options.host = args.host)

    api = Api(options.host, options.username!, options.password!, webcrypto as any)
  })

vorpal
  .command('pki <hcpId> <key>', 'Private Key Import')
  .action(async function (this: CommandInstance, args: Args) {
    if (!api) {
      this.log('You must be logged in to execute this command. Please use login first.')
      return
    }

    const hcpId = args.hcpId
    const key = args.key

    await api.cryptoApi.loadKeyPairsAsTextInBrowserLocalStorage(hcpId, hex2ua(key))
    if (
      await api.cryptoApi.checkPrivateKeyValidity(
        await api.healthcarePartyApi.getHealthcareParty(hcpId)
      )
    ) {
      this.log('Key is valid')
    } else {
      this.log('Key is invalid')
    }
  })

vorpal.command('lpkis', 'List Private Keys').action(async function (this: CommandInstance, args) {
  return api
    ? cmdListPrivateKeys(this, args, api)
    : this.log('You must be logged in to execute this command. Please use login first.')
})

vorpal.command('whoami', 'Logged user info').action(async function (this: CommandInstance) {
  if (!api) {
    this.log('You must be logged in to execute this command. Please use login first.')
    return
  }
  const user = await api.userApi.getCurrentUser()
  this.log(user.login + '@' + options.host)
  this.log(JSON.stringify(user, null, ' '))
  this.log(JSON.stringify(await api.healthcarePartyApi.getCurrentHealthcareParty(), null, ' '))
})

vorpal
  .command('pat [lastname] [firstname]', 'Search patient by last name and first name')
  .action(async function (this: CommandInstance, args) {
    return api
      ? cmdSearchPatient(this, args, api)
      : this.log('You must be logged in to execute this command. Please use login first.')
  })

vorpal
  .command(
    'checkaccess <entity> <hcpId1> <hcpId2> [hcpIds...]',
    'Get list of objects that have only a part of the hcp ids in their delegations'
  )
  .action(async function (this: CommandInstance, args) {
    return api
      ? cmdCheckDelegationsConsistency(this, args, api)
      : this.log('You must be logged in to execute this command. Please use login first.')
  })

vorpal
  .command('share <hcpId> [patIds...]', 'Share with hcp ids, the patients in the list')
  .action(async function (this: CommandInstance, args) {
    return api
      ? cmdShare(this, args, api)
      : this.log('You must be logged in to execute this command. Please use login first.')
  })

vorpal
  .command('shareall [hcpIds...]', 'Share all patients with hcp ids')
  .action(async function (this: CommandInstance, args) {
    return api
      ? cmdShareAll(this, args, api)
      : this.log('You must be logged in to execute this command. Please use login first.')
  })

vorpal
  .command('shamir [secret] [threshold] [hcpIds...]', 'Generate shamir partitions for hcpIds')
  .action(async function (this: CommandInstance, args) {
    return api
      ? cmdShamir(this, args, api)
      : this.log('You must be logged in to execute this command. Please use login first.')
  })

vorpal
  .command('checkhcpkey [from] [to]', 'Check that both parts of a hcpartykey are the same')
  .action(async function (this: CommandInstance, args) {
    return api
      ? cmdCheckHcpKey(this, args, api)
      : this.log('You must be logged in to execute this command. Please use login first.')
  })

vorpal
  .command('consistency [objectId] [entity]', 'Analyze consistency of contact or accesslog')
  .action(async function (this: CommandInstance, args) {
    return api
      ? cmdObjectConsistency(
          this,
          args,
          api,
          options as {
            host: string
            password: string
            username: string
          }
        )
      : this.log('You must be logged in to execute this command. Please use login first.')
  })

vorpal
  .command(
    'hcpuser <email> <password> <name> [parentId]',
    'Analyze consistency of contact or accesslog'
  )
  .action(async function (this: CommandInstance, args) {
    return api
      ? cmdUserHcp(
          this,
          args,
          api,
          options as {
            host: string
            password: string
            username: string
          }
        )
      : this.log('You must be logged in to execute this command. Please use login first.')
  })

vorpal.delimiter('icure-cli$').history('icr-cli').show()
