import {
  AbstractFilterContact,
  IccContactXApi,
  IccCryptoXApi,
  IccUserXApi,
  ListOfIds,
} from '@icure/api'
import { Args, CommandInstance } from 'vorpal'
import { contactsToPatientIds } from './utils.js'

export const cmdCheckDelegationsConsistency = async (
  cmd: CommandInstance,
  args: Args,
  api: {
    cryptoApi: IccCryptoXApi
    userApi: IccUserXApi
    contactApi: IccContactXApi
  }
): Promise<void> => {
  const all = {}
  const byHcp = {} as any
  const user = await api.userApi.getCurrentUser()

  const hcpIds = [args.hcpId1, args.hcpId2].concat(args.hcpIds)
  await Promise.all(
    hcpIds.map(async (hcpId: string) => {
      const batchIds = await api.contactApi.matchContactsBy(
        new AbstractFilterContact({
          healthcarePartyId: hcpId,
          $type: 'ContactByHcPartyTagCodeDateFilter',
        })
      )
      const batch = batchIds.reduce((acc: { [key: string]: number }, id: string) => {
        acc[id] = 1
        return acc
      }, {})
      byHcp[hcpId] = batch
      Object.assign(all, batch)
    })
  )

  const incomplete = Object.keys(all).filter((id) => Object.keys(byHcp).some((k) => !byHcp[k][id]))

  const patIds = await contactsToPatientIds(
    api,
    user.healthcarePartyId!,
    await api.contactApi.getContactsWithUser(user, new ListOfIds({ ids: incomplete }))
  )

  cmd.log(JSON.stringify(patIds))
}
