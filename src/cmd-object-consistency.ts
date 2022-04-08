import {
  apiHeaders,
  Delegation,
  hex2ua,
  IccAccesslogApi,
  IccAccesslogXApi,
  IccAgendaApi,
  IccAuthApi,
  IccCalendarItemXApi,
  IccClassificationXApi,
  IccCodeXApi,
  IccContactApi,
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
  ua2string,
} from '@icure/api'
import { IccDeviceApi } from '@icure/api/icc-api/api/IccDeviceApi'
import { Args, CommandInstance } from 'vorpal'
import { uniqWith } from './utils'

export const cmdObjectConsistency = async (
  cmd: CommandInstance,
  args: Args,
  api: {
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
  },
  options: {
    host: string
    password: string
    username: string
  }
): Promise<void> => {
  const hcp = await api.healthcarePartyApi.getCurrentHealthcareParty()
  const parent = hcp.parentId && (await api.healthcarePartyApi.getHealthcareParty(hcp.parentId))

  const key = (await api.healthcarePartyApi.getHealthcareParty(hcp.id)).hcPartyKeys![hcp.id]
  const keyParent =
    parent && (await api.healthcarePartyApi.getHealthcareParty(hcp.id)).hcPartyKeys![parent.id]

  cmd.log('Analyse hcpKeys')

  let selfKey1 = null
  try {
    selfKey1 = (await api.cryptoApi.decryptHcPartyKey(hcp.id, hcp.id, key[0], true)).rawKey
  } catch (e) {
    console.log(e)
  }
  let selfKey2 = null
  try {
    selfKey2 = (await api.cryptoApi.decryptHcPartyKey(hcp.id, hcp.id, key[1], false)).rawKey
  } catch (e) {
    console.log(e)
  }

  cmd.log(`${hcp.id} -> ${hcp.id} : ${selfKey1}`)
  cmd.log(`${hcp.id} <- ${hcp.id} : ${selfKey2}`)

  if (keyParent) {
    const toParentKey1 = (
      await api.cryptoApi.decryptHcPartyKey(hcp.id, parent.id, keyParent[0], true)
    ).rawKey
    const toParentKey2 = (
      await api.cryptoApi.decryptHcPartyKey(hcp.id, parent.id, keyParent[1], false)
    ).rawKey

    cmd.log(`${hcp.id} -> ${parent.id} : ${toParentKey1}`)
    cmd.log(`${hcp.id} <- ${parent.id} : ${toParentKey2}`)
  }

  const rawAccessLogApi = new IccAccesslogApi(
    options.host,
    apiHeaders(options.username, options.password)
  )
  const rawContactApi = new IccContactApi(
    options.host,
    apiHeaders(options.username, options.password)
  )

  const ety = args.entity || 'contact'
  const ctc = (
    ety === 'accesslog'
      ? await rawAccessLogApi.getAccessLog(args.objectId)
      : await rawContactApi.getContact(args.objectId)
  )!

  const allDelegationLikes = uniqWith(
    [ctc.delegations![hcp.id], ctc.encryptionKeys![hcp.id], ctc.cryptedForeignKeys![hcp.id]]
      .filter((x) => !!x)
      .concat(
        parent
          ? [
              ctc.delegations![parent.id],
              ctc.encryptionKeys![parent.id],
              ctc.cryptedForeignKeys![parent.id],
            ].filter((x) => !!x)
          : []
      )
      .flatMap((x) => x),
    (a, b) => a.owner! + a.delegatedTo! === b.owner! + b.delegatedTo!
  )

  const keys = await allDelegationLikes.reduce(async (p, d: Delegation) => {
    const pKeys = await p
    const from = await api.healthcarePartyApi.getHealthcareParty(d.owner!)
    const key = from.hcPartyKeys![d.delegatedTo!]
    pKeys[`${d.owner!}->${d.delegatedTo}`] = await api.cryptoApi.decryptHcPartyKey(
      d.owner!,
      d.delegatedTo!,
      key[1],
      false
    )
    cmd.log(`${d.owner!} -> ${d.delegatedTo!} : ${pKeys[d.owner! + '->' + d.delegatedTo].rawKey}`)
    return pKeys
  }, Promise.resolve({} as { [key: string]: { delegatorId: string; key: CryptoKey; rawKey: string } }))

  api.cryptoApi.AES.debug = true

  cmd.log('Analyse delegations')

  const analyseDelegationLike = async (
    delegations: { [p: string]: Array<Delegation> },
    hcpId: string,
    title: string
  ) => {
    if (delegations[hcpId]) {
      cmd.log(`>>>>> ${title} : ${hcpId} <<<<<`)
      await delegations[hcpId].reduce(async (p: Promise<any>, d: Delegation) => {
        await p
        cmd.log(
          `${title}: ${d.owner!} -> ${d.delegatedTo!} : ${ua2string(
            await api.cryptoApi.AES.decrypt(
              keys[d.owner + '->' + d.delegatedTo].key,
              hex2ua(d.key!).buffer
            )
          )}`
        )
      }, Promise.resolve())

      const decryptedAndImportedAesHcPartyKeys =
        await api.cryptoApi.decryptAndImportAesHcPartyKeysInDelegations(hcpId, delegations, false)
      const collatedAesKeysFromDelegatorToHcpartyId = {} as {
        [key: string]: { delegatorId: string; key: CryptoKey; rawKey: string }
      }
      decryptedAndImportedAesHcPartyKeys.forEach((k) => {
        collatedAesKeysFromDelegatorToHcpartyId[k.delegatorId] = k
      })
      cmd.log(
        `Hcparty keys from api : ${JSON.stringify(
          Object.keys(collatedAesKeysFromDelegatorToHcpartyId).map((k) => ({
            [k]: collatedAesKeysFromDelegatorToHcpartyId[k].rawKey,
          }))
        )}`
      )
      cmd.log(
        `${title} from api : ${JSON.stringify(
          await api.cryptoApi.decryptKeyInDelegationLikes(
            delegations[hcpId],
            collatedAesKeysFromDelegatorToHcpartyId,
            ctc.id!
          )
        )}`
      )
    }
  }

  await analyseDelegationLike(ctc.delegations!, hcp.id, 'Delegation')
  parent && (await analyseDelegationLike(ctc.delegations!, parent.id, 'Delegation'))
  await analyseDelegationLike(ctc.encryptionKeys!, hcp.id, 'Encryption key')
  parent && (await analyseDelegationLike(ctc.encryptionKeys!, parent.id, 'Encryption key'))
  await analyseDelegationLike(ctc.cryptedForeignKeys!, hcp.id, 'Crypted foreign key')
  parent && (await analyseDelegationLike(ctc.cryptedForeignKeys!, parent.id, 'Crypted foreign key'))

  if (ety === 'accesslog') {
    cmd.log('Decrypt with hcp')
    cmd.log(JSON.stringify((await api.accessLogApi.decrypt(hcp.id, [ctc]))[0]))
    if (parent) {
      cmd.log('Decrypt with parent')
      cmd.log(JSON.stringify((await api.accessLogApi.decrypt(parent.id, [ctc]))[0]))
    }
  } else {
    cmd.log('Decrypt with hcp')
    cmd.log(
      JSON.stringify(
        (await api.contactApi.decrypt(hcp.id, [ctc]))[0].services!.map((svc) => svc.content!.fr)
      )
    )
    if (parent) {
      cmd.log('Decrypt with parent')
      cmd.log(
        JSON.stringify(
          (await api.contactApi.decrypt(parent.id, [ctc]))[0].services!.map(
            (svc) => svc.content!.fr
          )
        )
      )
    }
  }
}
