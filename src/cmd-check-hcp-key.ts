import { IccCryptoXApi, IccHcpartyXApi } from '@icure/api'
import { Args, CommandInstance } from 'vorpal'

export const cmdCheckHcpKey = async (
  cmd: CommandInstance,
  args: Args,
  api: {
    cryptoApi: IccCryptoXApi
    healthcarePartyApi: IccHcpartyXApi
  }
): Promise<void> => {
  const key = (await api.healthcarePartyApi.getHealthcareParty(args.from)).hcPartyKeys![args.to]

  const fromToFrom = await api.cryptoApi.decryptHcPartyKey(args.from, args.to, key[0], true)
  const fromToTo = await api.cryptoApi.decryptHcPartyKey(args.from, args.to, key[1], false)

  cmd.log(`${args.from} -> ${args.to} : ${fromToFrom.rawKey}`)
  cmd.log(`${args.from} <- ${args.to} : ${fromToTo.rawKey}`)
}
